# LiQuery

Powerful search, tagging, filtering and sorting via simple text query language, for SQLite databases.

10kb maximized, no dependencies.


## Example

    hq hammond rock|metal !jazz type:mp3 year:1970-1980 rating:desc

Translates to:

```sql
SELECT * FROM music
WHERE search LIKE '%hammond%'
AND (search LIKE '%rock%' OR search LIKE '%metal%')
AND search NOT LIKE '%jazz%'
AND type='mp3'
AND year BETWEEN 1970 AND 1980
AND bitrate=320    -- preset from `hq` keyword
AND sampling=44.1  -- preset from `hq` keyword
ORDER BY rating DESC
LIMIT 100 OFFSET 0
```


## Reference

    keyword tag tag|tag !tag equal:1 greater>2 equalgt:>3 not!equal nil:null range:1-5 multi:1,a,x multineg!1,a,x sort:desc @2

    \s or +     separator
    keyword     expands to predefined subquery
    tag         like
    tag tag     like and like
    tag|tag     like or like
    !tag        not like
    field:3     equal
    field!3     not equal
    field>3     less/greater
    field:>3    less/greater equal
    field:null  null
    field:1,3   multi value, positive
    field!1,3   multi value, negative
    field:1-3   numeric range, inclusive
    field:asc   sort asc/desc
    random      random sort
    @2          result page number


## Database prerequisites

For tags/search, table must provide search field with content to be searched.

Tags and search terms are technically the same thing, the difference is semantic and depends on what you put in your search field, data, metadata, or both.


## Install

    npm i liquery


## Usage

```js
// import
const LiQuery = require('liquery')

// create and configure instance
const liquery = new LiQuery({
    table: "table_name"
})

// parse query
const q = liquery.parse(queryText)
// q.query         -- canonical query, cleaned and normalized user query string
// q.input         -- original user query, perhaps dirty
// q.sql.select    -- generated sql query for record retrieval
// q.sql.count     -- generated sql query for record count and stats
// q.page          -- result page number
// q.pages(count)  -- calculated number of pages, based on the number of records
// q.errors        -- occurred query processing errors

// now, with your SQLite driver of choice:
const items = db.query(q.sql.select)
const stats = db.query(q.sql.count)
```


## Config

Instance config

```js
const query = new LiQuery({  // showing defaults

    table: null,             // table name to query, the only required config param
    primary: "id",           // primary key column name (used only for default count)
    search: "search",        // search column name
    scope: null,             // SQL expression to narrow scope (ex user_id=1), used for every query

    select: ["*"],           // fields to pull on select query
    count:                   // stats to include in count query, sum, avg, etc
     ["COUNT(id) AS count"],
    limit: 100,              // limit retrieved records

    default: null,           // default query, see section below
    keywords: {},            // shortcuts that expand to sub queries
    aliases: {},             // field name aliases for use with filters and sorting
    processors: {},          // functions that transform filter values for SQL generation
    allowed: null,           // list of fields that can be filtered and sorted on

    debug: false             // dump processing errors to console
                             // keep intermediate object attached to result object
})
```

Request config

```js
query.parse(queryText, {
    page: 1,                 // result page, but `@` from user query have precedence
    limit: 100,              // overrides instance config value
    scope: null,             // SQL expression, in addition to scope from instance config
})
```


### Default query

Default query in LiQuery format. If provided, will be applied in part, or full to each user query. Rules to follow:

    keywords -- cannot be used in default query
    tags     -- always included, even if negated by user query
    filter   -- included if not overridden by user query, per field basis
    sort     -- used if user query does not specify sort


### Keywords

Keywords are like presets, they expand into subqueries. LiQuery format.

```js
keywords: {
    top:  "rating:desc",
    best: "rating:4-6",
    hq:   "bitrate:320 sampling:44.1",
}
```

Note that keywords cannot be negated, negated keyword `!keyword` will be treated just like a normal tag.


### Aliases

Aliases are used with db fields (filters and sort) to shorten or change name of the field.

```js
aliases: {
    id: "user",
    user_status: "status",
    user_last_seen: "seen",
}
```

    > user:1337
    > status:1
    > seen:desc


### Processors

Functions that transform filter values for SQL generation. Useful if we have for example `user_status` column that uses numerical ids, and we want to query it using status names. Note that fields must use real names, not aliases.

```js
// some lookup object
const userStatus = {
    inactive: 0,
    active: 1,
}

// processor directives
processors: {
    user_status: value => userStatus[value]
}
```
    // using with alias
    status:active

    // SQL
    ...WHERE user_status = 1


### Scope

SQL expression to narrow down the results. Only used for generated `SELECT` and `COUNT` queries.
Scope defined in instance config will be included in every query, additional scope can be added on per request basis.

    // use literal strings
    "user_id=1 AND status=2"


### Allowed

List of database columns that are allowed to be used for filter and sort. Fields from query that are not listed in `.allowed` or `.aliases` will be dropped from the query. Default value `null` disables enforcement, but will lead to database errors when trying to query non-existent db columns.


## Caveats

- no joins (this may change in the future)
- no spaces in tags or values
- uses `LIKE` operator, which might not be super performant on very large dataset
- uses `%` wildcard operator, so search for `foo` will pull `foobar` too
- probably more


![](https://hello.haxtra.com/gh-liquery)
