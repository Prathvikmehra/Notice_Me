/**
 * Global error handler middleware
 */
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  res.status(status).json({
    error: {
      message: err.message || 'Internal Server Error'
    }
  });
}
