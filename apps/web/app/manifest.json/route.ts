import { NextResponse } from "next/server";

export function GET() {
    return NextResponse.json(
        {
            name: "CrisisMap",
            short_name: "CrisisMap",
            description: "UNDP Community Damage Reporting",
            start_url: "/",
            display: "standalone",
            background_color: "#0F1729",
            theme_color: "#009EDB",
            icons: [
                {
                    src: "/icons/icon.svg",
                    sizes: "any",
                    type: "image/svg+xml",
                    purpose: "any",
                },
            ],
        },
        {
            headers: {
                "content-type": "application/manifest+json",
                "cache-control": "public, max-age=3600",
            },
        },
    );
}
