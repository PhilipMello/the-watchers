// Structured errors shared by infrastructure and data extensions.
export class DomainError extends Error {
  constructor(issues) { super(issues[0]?.code || 'invalid'); this.name='DomainError'; this.issues=issues; }
}
export function fail(code,path='',params={}) { throw new DomainError([{code,path,params}]); }
