# Phase 34 — Auto REST + GraphQL

The Pluto Data API exposes every table in the `public` schema (minus a
hardcoded hidden set — auth, billing, backups, etc.) over both REST and
GraphQL. Both surfaces share the same introspection cache and RLS path
(`SET LOCAL pluto.user_id` per request).

Enable with `PLUTO_ENABLE_DATA_API=1`.

## Discovery

```
GET /rest/v1/                → OpenAPI 3.1 document
GET /rest/v1/introspect      → { tables: [{ schema, name, columns: [...] }] }
GET /rest/v1/introspect?refresh=1   → force refresh
```

## REST CRUD (already shipped in `modules/rest/routes.ts`)

```
GET    /rest/v1/:table?col=eq.x&order=col.desc&limit=20&offset=0&select=a,b
POST   /rest/v1/:table            body: { … } or [{ … }]
PATCH  /rest/v1/:table?col=eq.x   body: { … }
DELETE /rest/v1/:table?col=eq.x
```

Filters: `eq neq gt gte lt lte like ilike is in`.

## GraphQL

```
POST /graphql/v1
{
  "query": "{ todos(where:{done:{eq:false}}, order:\"created_at.desc\", limit:10) { id title } }",
  "variables": {}
}
```

Mutations follow Hasura-style prefixes:

```graphql
mutation {
  insert_todos(objects: [{ title: "buy milk" }])                        { id }
  update_todos(where: { id: { eq: "..." } }, set: { done: true })       { id done }
  delete_todos(where: { id: { eq: "..." } })                            { id }
}
```

Supported operators: `eq neq gt gte lt lte like ilike in is_null`.
Not supported (yet): aliases, fragments, subscriptions, nested resolvers.

## RLS

Both surfaces open a transaction and run
`select set_config('pluto.user_id', <uid>, true)` before the query, so
RLS policies that call `current_user_id()` behave as the authenticated
user. `service_role` bypasses the GUC. A denied row returns `403
rls_denied` on REST; on GraphQL the field returns an entry in `errors`
and the transaction is rolled back.
