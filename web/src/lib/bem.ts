/** A BEM modifier class for a block, or none when the name is empty: modifier('pill', 'bad') is 'pill--bad'. */
export const modifier = (block: string, name: string) => (name ? `${block}--${name}` : '');
