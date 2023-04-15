const assert = require('assert')
const Equal = assert.strict.equal
const LiQuery = require('./')

let query, q, o;

// === Full: all features =================================

query = `
kword tag1 tag2 tagor1|tagor2 !tagnot
aliased:yes
illegal:yes
equal:1 gt>2 lt<3 gte:>4 lte:<5 noteq!6 nil:null
range:1-9
multi:123,abc,0x86
multi_neg!abc,0x86,123
numbers:asc letters:desc
`
q = new LiQuery({
	table: "my_table",
	primary: "id",
	search: "my_search",
	default: "deftag id:asc",

	select: ["id","name","beans"],
	count: ["COUNT(id) AS count", "SUM(beans) AS beans"],

	keywords: {
		kword: "foo:1 bar:2",
	},
	aliases: {
		aliased: "super_long_name",
	},
	processors: {
		super_long_name: val => val == "yes" ? 1 : 0
	},
	sortable: [
		"aliased", "equal", "gt", "lt", "gte", "lte", "noteq", "nil", "range", "multi", "multi_neg",
		"numbers", "letters", "foo", "bar", "id"
	],
	scope: "sqlfield=123",

	debug: true,
})

o = q.parse(query + " @5")


Equal(q.table, "my_table")
Equal(q.search, "my_search")
Equal(q.primary, "id")
Equal(q.default, "deftag id:asc")
Equal(q.keywords.kword, "foo:1 bar:2")
Equal(q.aliases.aliased, "super_long_name")
Equal(q.sortable.length, 16)

Equal(q.select[0], "id")
Equal(q.select[1], "name")
Equal(q.select[2], "beans")

Equal(q.count[0], "COUNT(id) AS count")
Equal(q.count[1], "SUM(beans) AS beans")

Equal(o.where[0], "sqlfield=123")
Equal(o.where[1], "my_search LIKE '%tag1%'")
Equal(o.where[2], "my_search LIKE '%tag2%'")
Equal(o.where[3], "(my_search LIKE '%tagor1%' OR my_search LIKE '%tagor2%')")
Equal(o.where[4], "my_search NOT LIKE '%tagnot%'")
Equal(o.where[5], "my_search LIKE '%deftag%'")
Equal(o.where[6], "super_long_name = 1")
Equal(o.where[7], "equal = 1")
Equal(o.where[8], "gt > 2")
Equal(o.where[9], "gte >= 4")
Equal(o.where[10], "lt < 3")
Equal(o.where[11], "lte <= 5")
Equal(o.where[12], "multi IN (123,'abc',0x86)")
Equal(o.where[13], "multi_neg NOT IN ('abc',0x86,123)")
Equal(o.where[14], "nil ISNULL")
Equal(o.where[15], "noteq != 6")
Equal(o.where[16], "range BETWEEN 1 AND 9")
Equal(o.where[17], "foo = 1")
Equal(o.where[18], "bar = 2")

Equal(o.limit, 100)
Equal(o.offset, 400)
Equal(o.page, 5)
Equal(o.pages(12345), 124)

Equal(o.sql.count,
	"SELECT COUNT(id) AS count, SUM(beans) AS beans FROM my_table WHERE " +
    "sqlfield=123 AND my_search LIKE '%tag1%' AND my_search LIKE '%tag2%' " +
    "AND (my_search LIKE '%tagor1%' OR my_search LIKE '%tagor2%') AND " +
    "my_search NOT LIKE '%tagnot%' AND my_search LIKE '%deftag%' AND " +
    "super_long_name = 1 AND equal = 1 AND gt > 2 AND gte >= 4 AND lt < 3 " +
    "AND lte <= 5 AND multi IN (123,'abc',0x86) AND multi_neg NOT IN " +
    "('abc',0x86,123) AND nil ISNULL AND noteq != 6 AND range BETWEEN 1 AND 9 " +
    "AND foo = 1 AND bar = 2")

Equal(o.sql.select,
	"SELECT id, name, beans FROM my_table WHERE sqlfield=123 AND " +
    "my_search LIKE '%tag1%' AND my_search LIKE '%tag2%' AND (my_search " +
    "LIKE '%tagor1%' OR my_search LIKE '%tagor2%') AND my_search NOT " +
    "LIKE '%tagnot%' AND my_search LIKE '%deftag%' AND super_long_name " +
    "= 1 AND equal = 1 AND gt > 2 AND gte >= 4 AND lt < 3 AND lte <= 5 " +
    "AND multi IN (123,'abc',0x86) AND multi_neg NOT IN ('abc',0x86,123) " +
    "AND nil ISNULL AND noteq != 6 AND range BETWEEN 1 AND 9 AND foo = " +
    "1 AND bar = 2 ORDER BY numbers ASC, letters DESC LIMIT 100 OFFSET " +
    "400")

Equal(o.errors.length, 1)
Equal(o.errors[0], "illegal")


// === Full: random sort ==================================

o = q.parse(query + " random", {page:22})

Equal(o.sql.select.indexOf("ORDER BY RANDOM()"), 471)
Equal(o.page, 22)
Equal(o.offset, 2100)


// === Full: parse scope ==================================

o = q.parse(query + " random", {scope:"foo='bar'", page:10, limit:20})

Equal(o.where[0], "sqlfield=123")
Equal(o.where[1], "foo='bar'")
Equal(o.limit, 20)
Equal(o.sql.select.indexOf("LIMIT 20 OFFSET 180"), 503)


// === Blank query ========================================

q = new LiQuery({
	table: "my_table",
})

o = q.parse()

Equal(q.table, "my_table")
Equal(q.search, "search")
Equal(o.sql.select, "SELECT * FROM my_table   LIMIT 100 OFFSET 0")
Equal(o.sql.count, "SELECT COUNT(id) AS count FROM my_table ")
Equal(o.page, 1)
Equal(o.offset, 0)


console.log("\n ✔ All tests passed.\n")
