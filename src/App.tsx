import { CRM } from "@/components/atomic-crm/root/CRM";

/**
 * HDH CRM entry point.
 *
 * Branding defaults (title, logos, currency) live in
 * `src/components/atomic-crm/root/defaultConfiguration.ts`; the visual theme
 * ("Ink & Champagne") lives in `src/index.css`.
 *
 * Other props you can pass to <CRM>: companySectors, dealCategories,
 * dealPipelineStatuses, dealStages, noteStatuses, taskTypes, title,
 * darkModeLogo / lightModeLogo, currency ... as well as all the props accepted
 * by shadcn-admin-kit's <Admin> component.
 *
 * Logos must be an imported asset, an absolute URL, or a data URI — never a
 * route-relative path like "./img/logo.png", which breaks on nested routes.
 */
const App = () => <CRM disableTelemetry />;

export default App;
