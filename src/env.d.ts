/** Vite bundles a module imported with `?worker&inline` into the page as a worker. */
declare module "*?worker&inline" {
  const WorkerConstructor: { new (): Worker };
  export default WorkerConstructor;
}
