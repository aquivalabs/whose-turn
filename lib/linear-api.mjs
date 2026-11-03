/** The one Linear GraphQL client, shared by the Linear connector and the feedback composer. */

const API = 'https://api.linear.app/graphql';

/** The `data` of one Linear GraphQL call with a personal API key; a GraphQL error throws an Error naming its messages. */
export const linearQuery = async (http, key, query, variables) => {
  const result = await http.fetchJson(API, { method: 'POST', body: { query, variables }, useEtag: false, headers: { Authorization: key, 'Content-Type': 'application/json' } });
  if (result.errors?.length) {
    throw new Error(result.errors.map((error) => error.message).join('; '));
  }
  return result.data;
};
