let _id = 0

export function request(method, params = {}) {
  return { jsonrpc: '2.0', method, params, id: ++_id }
}

export function response(id, result) {
  return { jsonrpc: '2.0', result, id }
}

export function error(id, code, message, data) {
  return { jsonrpc: '2.0', error: { code, message, ...(data && { data }) }, id }
}

export function isRequest(msg) {
  return msg.jsonrpc === '2.0' && typeof msg.method === 'string' && msg.id !== undefined
}

export function isResponse(msg) {
  return msg.jsonrpc === '2.0' && (msg.result !== undefined || msg.error !== undefined) && msg.id !== undefined
}

export function isEvent(msg) {
  return msg.jsonrpc === '2.0' && typeof msg.method === 'string' && msg.id === undefined
}

export const ERR = {
  PARSE_ERROR:         -32700,
  INVALID_REQUEST:     -32600,
  METHOD_NOT_FOUND:    -32601,
  INVALID_PARAMS:      -32602,
  TAB_NOT_FOUND:       -32000,
  ELEMENT_NOT_FOUND:   -32001,
  EXEC_ERROR:          -32002,
  DEBUGGER_ATTACH_FAILED: -32003,
}
