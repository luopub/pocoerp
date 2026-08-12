// async 路由包装器：把 Promise 异常交给统一错误处理
export const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next)
