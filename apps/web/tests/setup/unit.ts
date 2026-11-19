import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// jsdom does not implement window.matchMedia — polyfill for hooks like useMediaQuery
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom does not implement ResizeObserver — polyfill for cmdk (Command/Combobox)
if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom does not implement scrollIntoView — polyfill for cmdk keyboard highlight
if (typeof window !== "undefined") {
  window.HTMLElement.prototype.scrollIntoView = function () {};
}

// Initialize i18next for tests
i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: {
    en: {
      translation: {
        app_name: "CrisisMap",
        app_tagline: "Community Damage Reporting",
        language_label: "Language",
        language_name: "English",
        submit_report: "Submit Report",
        damage_level: "Damage Level",
        damage_minimal: "Minimal",
        damage_partial: "Partial",
        damage_complete: "Complete",
        damage_minimal_desc: "Structurally sound, cosmetic damage only",
        damage_partial_desc: "Repairable, visible structural damage",
        damage_complete_desc: "Structurally unsafe or destroyed",
        button: {
          next: "Next",
          submit: "Submit Report",
        },
        map: {
          keyboard_instructions:
            "Interactive map. Use arrow keys to pan, + and − to zoom. Or type coordinates (latitude, longitude) in the field below and press Enter.",
          aria_label: "Location picker",
          coordinates_label: "Location coordinates",
          coordinates_placeholder: "48.8566, 2.3522",
        },
        progress: {
          aria_label: "Submission steps",
        },
        step: {
          camera: {
            title: "Take a photo",
            instructions: "Photograph the damaged structure clearly.",
            label: "Take a photo",
            choose_prompt: "Tap to take or choose a photo",
            max_size: "Max {{maxSize}} MB",
            error_too_large:
              "Photo must be {{maxSize}} MB or smaller. Please choose a smaller file.",
          },
          confirm: {
            title: "Review your report",
            instructions: "Check the details before submitting.",
            damage_label: "Damage level",
            location_label: "Location",
            location_text_label: "Location details",
            description_label: "Additional description (optional)",
            description_placeholder: "Describe the damage or any hazards…",
          },
          damage: {
            title: "Damage level",
            instructions: "How severely is the structure damaged?",
            legend: "Select damage level",
          },
          location: {
            title: "Your location",
            instructions:
              "Place the pin on the damaged structure or type coordinates.",
            location_text_instructions:
              "Enter a location description (e.g., near central market)",
            location_text_placeholder: "e.g., near central market",
          },
        },
        success: {
          message: "Thank you. Your damage report has been received.",
          reference_label: "Reference:",
        },
        confirm_location: "Confirm Location",
        submitting: "Submitting…",
        submission_success: "Report submitted",
        connectivity: {
          online: "Online",
          offline: "Offline \u2014 reports will sync when connected",
        },
      },
    },
  },
  interpolation: {
    escapeValue: false,
  },
});
