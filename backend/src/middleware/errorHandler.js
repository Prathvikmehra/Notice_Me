export function errorHandler(error, req, res, next) {
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  if (status === 500) console.error(`Request failed: ${req.method} ${req.path}`);
  res.status(status).json({ error: { message: status === 500 ? 'Internal server error' : error.message } });
}
