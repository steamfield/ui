// Imports only the framework-free consent subpath. No React may reach the bundle, and nothing from
// the copy, tabs, reveal or agent demo subpaths.
import { createConsentStore, mountConsentBanner } from "@steamfield/ui/consent";

mountConsentBanner(createConsentStore({ domain: "example.com" }));
