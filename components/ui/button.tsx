import type { ButtonHTMLAttributes } from 'react';
export function Button({variant='primary',className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'ghost'|'danger'}){return <button className={`btn btn-${variant} ${className}`} {...props}/>;}
