/** A fixture module in the old shape, plain exports and no Adapter subclass, which the loader refuses. */
export const contract = 1;
export const id = 'plain';
export const label = 'Plain';
export const capabilities = ['tickets'];
export const fields = [];
export const poll = async () => ({ tickets: [] });
