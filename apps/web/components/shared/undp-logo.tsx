/* eslint-disable @next/next/no-img-element */

import type { ImgHTMLAttributes } from "react";

/**
 * Official UNDP logo.
 * Rendered as an image to avoid SVG text direction issues in RTL locales.
 */
export function UndpLogo(props: ImgHTMLAttributes<HTMLImageElement>) {
    return (
        <img
            src="https://www.undp.org/sites/g/files/zskgke326/files/2022-04/undp-logo-white.svg"
            alt=""
            aria-hidden="true"
            dir="ltr"
            {...props}
        />
    );
}
