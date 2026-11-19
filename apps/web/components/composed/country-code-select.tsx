"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCountryName } from "@/lib/api/crises-utils";

type CountryCodeSelectProps = {
    id: string;
    value: string;
    ariaLabel: string;
    placeholder: string;
    onChange: (value: string) => void;
    className?: string;
};

const FALLBACK_COUNTRY_CODES = [
    "AF",
    "AR",
    "BD",
    "BR",
    "CA",
    "CN",
    "DE",
    "ES",
    "FR",
    "GB",
    "ID",
    "IN",
    "IQ",
    "IT",
    "JP",
    "KE",
    "MX",
    "NP",
    "PH",
    "PK",
    "RU",
    "SY",
    "TR",
    "UA",
    "US",
    "ZA",
] as const;

function toFlagEmoji(countryCode: string): string {
    return countryCode
        .toUpperCase()
        .slice(0, 2)
        .split("")
        .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
        .join("");
}

function getCountryCodes(): string[] {
    const intlWithRegions = Intl as unknown as {
        supportedValuesOf?: (key: "region") => string[];
    };

    try {
        const regionCodes = intlWithRegions.supportedValuesOf?.("region");
        if (regionCodes && regionCodes.length > 0) {
            return regionCodes.filter((code) => code.length === 2);
        }
    } catch {
        // Fallback handled below for runtimes that do not support region values.
    }

    return [...FALLBACK_COUNTRY_CODES];
}

export function CountryCodeSelect({
    id,
    value,
    ariaLabel,
    placeholder,
    onChange,
    className,
}: CountryCodeSelectProps) {
    const { i18n } = useTranslation();

    const countryOptions = useMemo(() => {
        const locale = i18n.language;

        return getCountryCodes()
            .map((code) => ({
                code,
                label: getCountryName(code, locale),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [i18n.language]);

    return (
        <Select value={value ?? ""} onValueChange={onChange}>
            <SelectTrigger id={id} aria-label={ariaLabel} className={className}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {countryOptions.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                        {toFlagEmoji(country.code)} {country.label} ({country.code})
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
