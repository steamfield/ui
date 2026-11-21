import { Gif } from "@steamfield/ui/react/gif";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export const html: string = renderToStaticMarkup(
  createElement(Gif, { src: "/clips/demo.mp4", label: "Demo clip" }),
);
