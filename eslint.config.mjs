import next from "eslint-config-next";

const config = [
  { ignores: [".next/**", "node_modules/**", "research_notes/**", "reports/**", "next-env.d.ts"] },
  ...next,
];

export default config;
