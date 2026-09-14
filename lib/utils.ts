import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge resolves conflicts by class group, and it cannot tell a custom
 * font-size name from a custom colour name: given `text-text-1 text-body` it
 * assumed both were font sizes and dropped the colour. Declaring the size scale
 * makes every `text-*` that is not in this list a colour, which is what the
 * token names mean.
 *
 * Keep this list in step with the `--text-*` tokens in app/globals.css.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "micro",
            "chip",
            "tiny",
            "data",
            "body",
            "wordmark",
            "figure",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
