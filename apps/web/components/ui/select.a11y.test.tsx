// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { axe, toHaveNoViolations } from "jest-axe";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./select";

expect.extend(toHaveNoViolations);

describe("Select a11y", () => {
    it("has no axe violations", async () => {
        const { container } = render(
            <Select defaultValue="RESIDENTIAL">
                <SelectTrigger aria-label="Infrastructure type">
                    <SelectValue placeholder="Choose infrastructure" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="RESIDENTIAL">Residential</SelectItem>
                    <SelectItem value="COMMERCIAL">Commercial</SelectItem>
                </SelectContent>
            </Select>,
        );

        const results = await axe(container);
        expect(results).toHaveNoViolations();
    });
});
