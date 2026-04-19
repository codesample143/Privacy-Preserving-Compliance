/// <reference types="vite/client" />

declare module "@circuits/*/target/*.json" {
  const value: unknown;
  export default value;
}
