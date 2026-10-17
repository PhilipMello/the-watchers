// Legacy migration is keyed by the original stable field ID, never by translated labels.
export function fieldFormat(field,definition){return field.display_format||definition?.display_format||(field.value_type==='integer'&&field.id==='attribute_birth_year'?'year':'number');}
export function formatNumber(field,locale,definition){return new Intl.NumberFormat(locale,{useGrouping:fieldFormat(field,definition)!=='year'}).format(field.value);}
