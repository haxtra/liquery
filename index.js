"use strict"

class LiQuery {

	table = null
	primary = 'id'
	search = 'search'

	default = null
	keywords = {}
	aliases = {}
	processors = {}
	sortable = null

	select = ["*"]
	count = [`COUNT(${this.primary}) AS count`]
	limit = 100

	scope = null	// sql filter to narrow scope

	debug = false


	constructor(params={}) {

		// configuration
		for(const key in params)
			this[key] = params[key]
	}

	createContainer(opts) {

		return {
			input: null,
			query: null,
			sql: {
				select: null,
				count: null,
			},
			page: opts.page || 1,
			pages: function(count) { return Math.ceil(count / this.limit) },
			offset: 0,
			limit: opts.limit || this.limit,

			errors: [],

			// internal
			parsed: {
				query: {			// user query
					keywords: [],
					tags: [],
					tagsOr: [],
					tagsNot: [],
					filters: [],
					sort: [],
				},
				keywords: { 		// expanded keywords
					tags: [],
					tagsOr : [],
					tagsNot: [],
					filters: [],
					sort: [],
				},
				default: { 			// defaults
					tags: [],
					tagsOr : [],
					tagsNot: [],
					filters: [],
					sort: [],
				}
			},
		}
	}

	parse(query, opts={}) {
		/** Process supplied input. We can reuse configured instance by passing new query **/

		const obj = this.createContainer(opts)

		obj.query = query
		obj.input = query // store original

		// process user query
		if(obj.query){
			// clean input
			obj.query = obj.query
							.replace(/\+/g, ' ')	// replace + for space, for when it comes from the url
							.replace(/\s+/g, ' ')	// remove extra whitespace
							.trim() 				// remove leading/trailing spaces

			this.processPart(obj, obj.query, obj.parsed.query, this.keywords, true)
		}

		// expand and process keywords
		for(const keyword of obj.parsed.query.keywords)
			this.processPart(obj, this.keywords[keyword], obj.parsed.keywords)

		// process resource default
		if(this.default)
			this.processPart(obj, this.default, obj.parsed.default)

		// normalize query, put valid parts in right order
		this.normalize(obj)

		// generate clean, canonical query
		this.generateQuery(obj)

		// generate sql statements
		this.generateSQL(obj, opts)

		// drop internal fields
		if(!this.debug)
			delete obj.parsed

		// dump errors, if any
		if(this.debug && obj.errors.length)
			console.error('LiQuery errors:', obj.errors)

		return obj
	}

	processPart(obj, input, container, keywords={}, dedupe) {

		// split to parts and figure their type
		let parts = input.split(' ')

		// remove duplicates, only for user query
		if(dedupe)
			parts = parts.filter( (value, index, self) => self.indexOf(value) === index )

		// verify that field use is allowed
		const useField = field => this.sortable ? (this.sortable.includes(field) || this.aliases[field] ? true : false) : true

		// identify parts of the query and put them to relevant buckets
		let match = false
		for(const part of parts){

			// skip empty
			if(part == ''){
				continue
			}
			// random sort
			else if(part == 'random'){
				container.sort.push({order:'random'})
			}
			// sort type
			else if(match = part.match(/([a-z0-9_]+):(asc|desc)/)){
				if(useField(match[1]))
					container.sort.push({
						field: match[1],
						order: match[2]
					})
				else
					obj.errors.push(match[1])
			}
			// filter: range type (numeric only)
			else if(match = part.match(/([a-z0-9_]+):([0-9\.]+)-([0-9\.]+)/)){
				if(useField(match[1]))
					container.filters.push({
						field: match[1],
						operator: '-',
						value: [match[2], match[3]],
					})
				else
					obj.errors.push(match[1])
			}
			// filter: value type, eqal|not equal
			else if(match = part.match(/([a-z0-9_]+)(:|!)([a-z0-9-_/\.,\{\}]+)/)){
				if(useField(match[1]))
					container.filters.push({
						field: match[1],
						operator: match[2],
						// multivalue?
						value: match[3].includes(',') ? match[3].split(',') : match[3],
					})
				else
					obj.errors.push(match[1])
			}
			// filter: value type, less, greater
			else if(match = part.match(/([a-z0-9_]+)(<|>|:<|:>)([a-z0-9-_/\.\{\}]+)/)){ // comma is reserved
				if(useField(match[1]))
					container.filters.push({
						field: match[1],
						operator: match[2],
						value: match[3],
					})
				else
					obj.errors.push(match[1])
			}
			// keyword
			else if(keywords[part]){
				container.keywords.push(part)
			}
			// tag - or
			else if(match = part.match(/\|/)){
				// split on | and remove empty elems, in case of bad input
				const or_parts = part.split('|').filter(Boolean)
				if(or_parts.length > 1)
					container.tagsOr.push(or_parts)
				else if(or_parts.length > 0)
					container.tags.push(or_parts[0])
			}
			// tag - inclusive or negated
			else if(match = part.match(/^(!?)([a-z0-9\.]+)$/)){
				if(match[1]){
					// negated tag
					container.tagsNot.push(match[2])
				} else {
					// inclusive tag
					container.tags.push(match[2])
				}
			}
			// page number
			else if(match = part.match(/^@(\d+)$/)){
				obj.page = parseInt(match[1])
			}
			else {
				obj.errors.push(part)
			}
		}
	}

	normalize(obj) {
		/** Sort parsed user query elements of each type in alpha order **/

		const query = obj.parsed.query

		// sort keywords
		query.keywords.sort()

		// sort tags
		query.tags.sort()

		// sort tags OR
		for(const tagsOrGroup of query.tagsOr){
			tagsOrGroup.sort()
		}

		// sort tags NOT
		query.tagsNot.sort()

		// sort filters
		query.filters.sort((a,b) => a.field > b.field ? 1 : (b.field > a.field ? -1 : 0) )
	}

	generateQuery(obj) {
		/** Generate clean, normalized query that has parts in right order **/

		const query = obj.parsed.query

		// add keywords and tags
		const clean = [].concat(query.keywords, query.tags)

		// tags OR
		for(const tagsOr of query.tagsOr)
			clean.push(tagsOr.join('|'))

		// tags NOT
		for(const tagNot of query.tagsNot)
			clean.push('!' + tagNot)

		// filter
		for(const filter of query.filters){
			if(Array.isArray(filter.value))
				// multivalue or range filter, between
				if(filter.operator == '-')
					// range
					clean.push(`${filter.field}:${filter.value[0]}-${filter.value[1]}`)
				else
					// multivalue
					clean.push(`${filter.field}${filter.operator}${filter.value.join(',')}`)
			else
				// normal filter eq, gt, lt
				clean.push(filter.field + filter.operator + filter.value)
		}

		// sort
		let sorting = []
		for(const sort of query.sort) {
			if(sort.order == 'random'){
				// random sort cancels any other
				sorting = ['random']
				break;
			} else {
				sorting.push(sort.field + ':' + sort.order)
			}
		}

		// done
		obj.query = [].concat(clean, sorting).join(' ')
	}

	generateSQL(obj, opts={}) {
		/** Generate SELECT and COUNT sql queries **/

		const where = []

		// add hard scope
		if(this.scope)
			where.push(this.scope)

		// add request scope
		if(opts.scope)
			where.push(opts.scope)

		// TAGS
		// - include all from each source

		for(const source of ['query', 'keywords', 'default']) {

			for(const tagAnd of obj.parsed[source].tags)
				where.push(`${this.search} LIKE '%${tagAnd}%'`)

			for(const tagOrGroup of obj.parsed[source].tagsOr){
				const parts = []
				for(const tagOr of tagOrGroup)
					parts.push(`${this.search} LIKE '%${tagOr}%'`)
				where.push(`(${parts.join(' OR ')})`)
			}

			for(const tagNot of obj.parsed[source].tagsNot)
				where.push(`${this.search} NOT LIKE '%${tagNot}%'`)
		}

		// FILTER
		// - include user query and keywords
		// - add default if not overriden by user query

		// track applied filters, used to determine if default filter on that field should be included
		const activeFilters = {}

		for(const source of ['query', 'keywords', 'default']){

			for(const filter of obj.parsed[source].filters){

				// use real field name, translate alias if it exists
				const realName = this.aliases[filter.field] || filter.field

				// skip default if already filtered on that field
				if(source == 'default' && activeFilters[realName])
					continue;

				activeFilters[realName] = true

				where.push(this.processFilter(realName, filter))
			}
		}

		// SORT
		// - only one source, order of precedence: query => keyword => default

		let sorting = []
		sortLoop: // label for breaking from nested loop
		for(const source of ['query', 'keywords', 'default']){

			if(!obj.parsed[source].sort.length)
				continue;

			for(const sort of obj.parsed[source].sort){

				if(sort.order == 'random'){
					sorting = ['RANDOM()']
					// random cancels all other sort methods
					break sortLoop;
				}
				else
					// add elem to order clause, mind the alias
					sorting.push((this.aliases[sort.field] || sort.field) + ' ' + sort.order.toUpperCase())
			}

			// only one source of sort is allowed
			// if we are here, that means we've got something, and we bolt
			break;
		}

		const sort = sorting.length ? 'ORDER BY ' + sorting.join(', ') : ''

		// LIMIT & OFFSET

		obj.offset = (obj.page - 1) * obj.limit
		const offset = `LIMIT ${obj.limit} OFFSET ${obj.offset}`

		// BUILD QUERY

		const select = this.select.join(', ')
		const count = this.count.join(', ')
		const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : ''

		obj.sql.select = `SELECT ${select} FROM ${this.table} ${whereStr} ${sort} ${offset}`
		obj.sql.count  = `SELECT ${count} FROM ${this.table} ${whereStr}`

		if(this.debug)
			obj.where = where
	}

	operators = {
		':':'=', '<':'<', '>':'>',
		'!':'!=', ':<':'<=', ':>':'>=',
	}

	processFilter(fieldName, filter) {

		// get original or processed value, if processor is available
		const value = this.processors[fieldName] ? this.processors[fieldName](filter.value) : filter.value

		if(Array.isArray(value)) {
			// multivalue or range filter
			if(filter.operator == '-')
				return `${fieldName} BETWEEN ${value[0]} AND ${value[1]}`
			else
				return `${fieldName} ${filter.operator == ':' ? 'IN' : 'NOT IN'} (${value.map(val => isNaN(val) ? `'${val}'` : val).join(',')})`

		} else {

			// null value
			if(value == 'null')
				return fieldName + ' ISNULL'

			// normal filter
			return `${fieldName} ${this.operators[filter.operator]} ${isNaN(value) ? `'${value}'` : value}`
		}
	}
}

module.exports = LiQuery
