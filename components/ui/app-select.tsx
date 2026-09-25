'use client';
import { Children, isValidElement, useEffect, useId, useRef, useState, type OptionHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { EmojiText } from '../emoji';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

type SelectChange = { target: { value: string } };
type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & { onChange?: (event: SelectChange) => void };
type Item = { value: string; label: ReactNode; text: string; disabled: boolean };
/** Plain-text labels (e.g. "🍜 Makan") get the Fluent Emoji artwork; anything richer is shown as is. */
const showLabel = (label: ReactNode) => { const parts = Array.isArray(label) ? label : [label]; return parts.every(part => typeof part === 'string' || typeof part === 'number') ? <EmojiText text={parts.join('')}/> : label; };
type MenuPosition = { top: number; left: number; width: number; maxHeight: number };

export function AppSelect({ children, value, defaultValue, onChange, disabled, required, name, className = '', title, style, 'aria-label': ariaLabel, ...rest }: Props) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const options: Item[] = Children.toArray(children).filter(isValidElement<OptionHTMLAttributes<HTMLOptionElement>>).map(option => ({
    value: String(option.props.value ?? ''),
    label: option.props.children,
    text: String(option.props.label ?? option.props.children ?? ''),
    disabled: Boolean(option.props.disabled),
  }));
  const current = String(value ?? defaultValue ?? '');
  const selected = options.find(item => item.value === current);

  useEffect(() => { setInvalid(false); }, [current]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open || !trigger.current) return;
    const anchor = trigger.current;
    const dialog = anchor.closest<HTMLElement>('.app-dialog');
    setHost(dialog);
    const rect = anchor.getBoundingClientRect();
    const height = Math.min(264, options.length * 42 + 12);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upwards = below < Math.min(180, height) && above > below;
    const maxHeight = Math.max(90, Math.min(264, upwards ? above : below));
    const visibleHeight = Math.min(height, maxHeight);
    const top = Math.max(8, Math.min(upwards ? rect.top - visibleHeight - 7 : rect.bottom + 7, window.innerHeight - visibleHeight - 8));
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));
    const parentRect = dialog?.getBoundingClientRect();
    setPosition({ top: top - (parentRect?.top ?? 0), left: left - (parentRect?.left ?? 0), width: rect.width, maxHeight });
    const outside = (event: PointerEvent) => {
      if (!anchor.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) setOpen(false); };
    const resize = () => setOpen(false);
    // Escape closes only this menu. The capture listener on window runs before the
    // surrounding dialog's own Escape handler, which would otherwise close the whole form.
    const escape = (event: KeyboardEvent) => { if (event.key !== 'Escape') return; event.stopPropagation(); event.preventDefault(); setOpen(false); anchor.focus(); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape, true); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize); };
  }, [open, options.length]);

  function choose(item: Item) {
    if (item.disabled) return;
    onChange?.({ target: { value: item.value } });
    setInvalid(false);
    setOpen(false);
    trigger.current?.focus();
  }
  function move(direction: number) {
    if (!open) {
      setActive(Math.max(0, options.findIndex(item => item.value === current && !item.disabled)));
      setOpen(true);
      return;
    }
    let next = active;
    for (let i = 0; i < options.length; i++) {
      next = (next + direction + options.length) % options.length;
      if (!options[next].disabled) { setActive(next); break; }
    }
  }
  function keyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1); }
    else if (event.key === 'Home' && open) { event.preventDefault(); setActive(Math.max(0, options.findIndex(item => !item.disabled))); }
    else if (event.key === 'End' && open) { event.preventDefault(); setActive(Math.max(0, options.findLastIndex(item => !item.disabled))); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (open && options[active]) choose(options[active]); else move(0); }
    else if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); }
    else if (event.key === 'Tab') setOpen(false);
    else if (open && event.key.length === 1) {
      const next = options.findIndex(item => !item.disabled && item.text.toLowerCase().startsWith(event.key.toLowerCase()));
      if (next >= 0) setActive(next);
    }
  }

  return <span className="app-select" style={style}>
    <button ref={trigger} type="button" role="combobox" aria-label={ariaLabel} aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="listbox" aria-activedescendant={open ? `${id}-${active}` : undefined} aria-required={required || undefined} aria-invalid={invalid || undefined} className={`input app-select-trigger ${!current ? 'is-placeholder' : ''} ${invalid ? 'is-invalid' : ''} ${className}`} title={title} disabled={disabled} onClick={() => { setActive(Math.max(0, options.findIndex(item => item.value === current && !item.disabled))); setOpen(wasOpen => !wasOpen); }} onKeyDown={keyDown}>
      <span className="app-select-value">{selected ? showLabel(selected.label) : 'Pilih opsi'}</span><ChevronDown size={17} aria-hidden="true" className={open ? 'rotated' : ''}/>
    </button>
    <select {...rest} name={name} required={required} disabled={disabled} value={current} tabIndex={-1} aria-hidden="true" className="app-select-validation" onChange={event => onChange?.({ target: { value: event.target.value } })} onInvalid={event => { event.preventDefault(); setInvalid(true); trigger.current?.focus(); }}>{children}</select>
    {open && position && createPortal(<div ref={menu} id={id} role="listbox" aria-label={ariaLabel ?? title ?? 'Pilih opsi'} className="app-select-menu" style={{ position: host ? 'absolute' : 'fixed', ...position }}>
      {options.map((item, index) => <button key={`${item.value}-${index}`} id={`${id}-${index}`} type="button" role="option" aria-selected={item.value === current} disabled={item.disabled} className={`app-select-option ${index === active ? 'active' : ''} ${item.value === current ? 'selected' : ''}`} onPointerMove={() => setActive(index)} onPointerDown={event => event.preventDefault()} onClick={() => choose(item)}><span>{showLabel(item.label)}</span>{item.value === current && <Check size={16} aria-hidden="true"/>}</button>)}
    </div>, host ?? document.body)}
  </span>;
}
