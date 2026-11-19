export const rowScrollStorybookMock = {
  rows: [...Array(14).keys()].map((index) => ({ key: `PROJ-${index + 1}`, summary: `Item — rising ${index + 1}` })),
};
