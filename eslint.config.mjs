import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: ["__MACOSX/**"]
  },
  ...nextVitals
];

export default eslintConfig;
