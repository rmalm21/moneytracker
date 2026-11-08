"""Replace GatherBlockQuantized (not in onnxruntime-web's WASM build) with standard ops: gather the packed 4-bit rows and
their scales, unpack the two signed nibbles of each byte with float arithmetic, and multiply by the block scales."""
import sys, numpy as np, onnx
from onnx import helper as H, numpy_helper as N, TensorProto as TP
src, dst = sys.argv[1:3]
m = onnx.load(src, load_external_data=True)
print('opsets', [(o.domain, o.version) for o in m.opset_import])
g = m.graph; inits = {i.name: i for i in g.initializer}
node = next(n for n in g.node if n.op_type == 'GatherBlockQuantized')
wname, ids, sname = node.input; out = node.output[0]
W = inits[wname]; V, D = W.dims; block = 32
packed = np.frombuffer(W.raw_data, dtype=np.uint8).reshape(V, D // 2)
g.initializer.remove(W)
g.initializer.append(N.from_array(packed, 'emb_packed_u8'))
c = lambda name, arr: g.initializer.append(N.from_array(np.array(arr), name))
c('c16', np.float32(16)); c('c7_5', np.float32(7.5)); c('c_inv16', np.float32(1 / 16))
c('shape_tail_unpack', np.array([D // 2, 2], dtype=np.int64)); c('shape_tail_blocks', np.array([D // block, block], dtype=np.int64))
c('shape_tail_d', np.array([D], dtype=np.int64)); c('shape_tail_sc', np.array([D // block, 1], dtype=np.int64)); c('axis_last', np.array([-1], dtype=np.int64))
P = 'degbq/'
nodes = [
  H.make_node('Shape', [ids], [P + 'ids_shape']),
  H.make_node('Gather', ['emb_packed_u8', ids], [P + 'rows_u8'], axis=0),
  H.make_node('Cast', [P + 'rows_u8'], [P + 'rows_f'], to=TP.FLOAT),
  H.make_node('Mul', [P + 'rows_f', 'c_inv16'], [P + 'hi_div']),
  H.make_node('Floor', [P + 'hi_div'], [P + 'hi']),                      # high nibble
  H.make_node('Mul', [P + 'hi', 'c16'], [P + 'hi16']),
  H.make_node('Sub', [P + 'rows_f', P + 'hi16'], [P + 'lo']),            # low nibble (first value)
  H.make_node('Unsqueeze', [P + 'lo', 'axis_last'], [P + 'lo_u']),
  H.make_node('Unsqueeze', [P + 'hi', 'axis_last'], [P + 'hi_u']),
  H.make_node('Concat', [P + 'lo_u', P + 'hi_u'], [P + 'pairs'], axis=-1),
  H.make_node('Greater', [P + 'pairs', 'c7_5'], [P + 'neg']),            # signed int4: 8..15 are -8..-1
  H.make_node('Sub', [P + 'pairs', 'c16'], [P + 'pairs_m16']),
  H.make_node('Where', [P + 'neg', P + 'pairs_m16', P + 'pairs'], [P + 'vals']),
  H.make_node('Concat', [P + 'ids_shape', 'shape_tail_blocks'], [P + 'shape_blocks'], axis=0),
  H.make_node('Reshape', [P + 'vals', P + 'shape_blocks'], [P + 'vals_b']),
  H.make_node('Gather', [sname, ids], [P + 'sc'], axis=0),
  H.make_node('Concat', [P + 'ids_shape', 'shape_tail_sc'], [P + 'shape_sc'], axis=0),
  H.make_node('Reshape', [P + 'sc', P + 'shape_sc'], [P + 'sc_b']),
  H.make_node('Mul', [P + 'vals_b', P + 'sc_b'], [P + 'deq_b']),
  H.make_node('Concat', [P + 'ids_shape', 'shape_tail_d'], [P + 'shape_d'], axis=0),
  H.make_node('Reshape', [P + 'deq_b', P + 'shape_d'], [out]),
]
pos = list(g.node).index(node); g.node.remove(node)
for k, n in enumerate(nodes): g.node.insert(pos + k, n)
onnx.save_model(m, dst, save_as_external_data=True, all_tensors_to_one_file=True, location=dst.split('/')[-1] + '_data', size_threshold=1024)
print('saved', dst)
