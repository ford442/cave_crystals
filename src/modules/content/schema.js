// @ts-check
/**
 * Tiny declarative shape checker for authored JSON content.
 *
 * No runtime dependency: content files are small and the rules we need (types, ranges,
 * enums, unknown-key rejection) fit in ~100 lines. Every problem is collected with a
 * JSON-path-ish location so one test run reports all mistakes in a file, not just the first.
 */

/**
 * @typedef {Object} FieldSpec
 * @property {'string' | 'number' | 'boolean' | 'array' | 'object' | 'map' | 'color'} type
 * @property {boolean} [required]       Missing/undefined is an error (default false).
 * @property {boolean} [nullable]       `null` is accepted in place of a value.
 * @property {number} [min]             number: inclusive lower bound.
 * @property {number} [max]             number: inclusive upper bound.
 * @property {number} [exclusiveMin]    number: strict lower bound.
 * @property {boolean} [integer]        number: must be an integer.
 * @property {readonly (string | number)[]} [enum]  string/number: allowed values.
 * @property {RegExp} [pattern]         string: must match.
 * @property {number} [minLength]       string: minimum length.
 * @property {number} [minItems]        array: minimum length.
 * @property {boolean} [uniqueItems]    array: primitive items must be distinct.
 * @property {FieldSpec} [items]        array: spec for each item.
 * @property {Record<string, FieldSpec>} [fields]  object: known fields.
 * @property {boolean} [allowUnknown]   object: tolerate keys not in `fields` (default false).
 * @property {FieldSpec} [values]       map: spec for every value.
 * @property {RegExp} [keyPattern]      map: every key must match.
 */

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** @param {unknown} v */
function describe(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
}

/**
 * @param {unknown} value
 * @param {FieldSpec} spec
 * @param {string} path
 * @param {string[]} errors
 */
export function checkValue(value, spec, path, errors) {
    if (value === undefined) {
        if (spec.required) errors.push(`${path}: is required`);
        return;
    }
    if (value === null) {
        if (!spec.nullable) errors.push(`${path}: must not be null`);
        return;
    }

    switch (spec.type) {
        case 'string':
        case 'color': {
            if (typeof value !== 'string') {
                errors.push(`${path}: expected string, got ${describe(value)}`);
                return;
            }
            if (spec.type === 'color' && !HEX_COLOR.test(value)) {
                errors.push(`${path}: expected hex color like "#ff8800", got "${value}"`);
            }
            if (spec.minLength != null && value.length < spec.minLength) {
                errors.push(`${path}: must be at least ${spec.minLength} character(s)`);
            }
            if (spec.pattern && !spec.pattern.test(value)) {
                errors.push(`${path}: "${value}" does not match ${spec.pattern}`);
            }
            if (spec.enum && !spec.enum.includes(value)) {
                errors.push(`${path}: "${value}" is not one of ${spec.enum.join(', ')}`);
            }
            return;
        }
        case 'number': {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                errors.push(`${path}: expected finite number, got ${describe(value)}`);
                return;
            }
            if (spec.integer && !Number.isInteger(value)) errors.push(`${path}: must be an integer`);
            if (spec.min != null && value < spec.min) errors.push(`${path}: must be >= ${spec.min}, got ${value}`);
            if (spec.max != null && value > spec.max) errors.push(`${path}: must be <= ${spec.max}, got ${value}`);
            if (spec.exclusiveMin != null && value <= spec.exclusiveMin) {
                errors.push(`${path}: must be > ${spec.exclusiveMin}, got ${value}`);
            }
            if (spec.enum && !spec.enum.includes(value)) {
                errors.push(`${path}: ${value} is not one of ${spec.enum.join(', ')}`);
            }
            return;
        }
        case 'boolean':
            if (typeof value !== 'boolean') errors.push(`${path}: expected boolean, got ${describe(value)}`);
            return;
        case 'array': {
            if (!Array.isArray(value)) {
                errors.push(`${path}: expected array, got ${describe(value)}`);
                return;
            }
            if (spec.minItems != null && value.length < spec.minItems) {
                errors.push(`${path}: must have at least ${spec.minItems} item(s)`);
            }
            if (spec.uniqueItems && new Set(value).size !== value.length) {
                errors.push(`${path}: items must be unique`);
            }
            if (spec.items) {
                value.forEach((item, i) => checkValue(item, spec.items, `${path}[${i}]`, errors));
            }
            return;
        }
        case 'object': {
            if (typeof value !== 'object' || Array.isArray(value)) {
                errors.push(`${path}: expected object, got ${describe(value)}`);
                return;
            }
            const obj = /** @type {Record<string, unknown>} */ (value);
            const fields = spec.fields || {};
            for (const [key, fieldSpec] of Object.entries(fields)) {
                checkValue(obj[key], fieldSpec, `${path}.${key}`, errors);
            }
            if (!spec.allowUnknown) {
                for (const key of Object.keys(obj)) {
                    if (!(key in fields)) errors.push(`${path}.${key}: unknown field`);
                }
            }
            return;
        }
        case 'map': {
            if (typeof value !== 'object' || Array.isArray(value)) {
                errors.push(`${path}: expected object map, got ${describe(value)}`);
                return;
            }
            for (const [key, v] of Object.entries(value)) {
                if (spec.keyPattern && !spec.keyPattern.test(key)) {
                    errors.push(`${path}: key "${key}" does not match ${spec.keyPattern}`);
                }
                if (spec.values) checkValue(v, spec.values, `${path}.${key}`, errors);
            }
            return;
        }
        default:
            errors.push(`${path}: schema bug — unknown spec type ${/** @type {any} */ (spec).type}`);
    }
}

/**
 * Report duplicate `key` values across `items` (e.g. duplicate ids).
 * @param {unknown[]} items
 * @param {string} key
 * @param {string} path
 * @param {string[]} errors
 */
export function checkUniqueBy(items, key, path, errors) {
    /** @type {Map<unknown, number>} */
    const seen = new Map();
    items.forEach((item, i) => {
        if (!item || typeof item !== 'object') return;
        const v = /** @type {Record<string, unknown>} */ (item)[key];
        if (v === undefined) return;
        if (seen.has(v)) {
            errors.push(`${path}[${i}].${key}: duplicate ${key} ${JSON.stringify(v)} (first at index ${seen.get(v)})`);
        } else {
            seen.set(v, i);
        }
    });
}
