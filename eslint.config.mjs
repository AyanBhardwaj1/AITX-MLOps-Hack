import next from "eslint-config-next";

export default [
  { ignores: [".next/**", "node_modules/**", "research_notes/**", "reports/**", "next-env.d.ts"] },
  ...next,
];
