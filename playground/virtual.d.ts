declare module "virtual:markdown-sample" {
  export const html: string;
  export const headings: ReadonlyArray<{ depth: number; slug: string; text: string }>;
}
