// @ts-check

const FOOTER_LABEL = "Built by Marco Polo Research Lab";

/**
 * @param {{contact?: {label: string, href: string}, themeAttribute?: string}} [options]
 * @returns {Promise<void>}
 */
export async function initializeSiteFooter({ contact, themeAttribute } = {}) {
  const footer = document.querySelector("#site-footer");
  if (!footer) throw new Error("site.footer_host_missing");
  await customElements.whenDefined("mpr-footer");
  const links = globalThis.MPRUI.getFooterSiteCatalog().map(({ url, ...link }) => ({ ...link, href: url }));
  if (contact) links.push({ label: contact.label, href: contact.href });
  footer.setAttribute("menu", JSON.stringify({
    label: FOOTER_LABEL,
    placement: "top",
    sections: [{ id: "mpr-projects", label: "Projects", mode: "static", links }],
  }));
  footer.setAttribute("size", "small");
  footer.setAttribute("privacy-link-hidden", "true");
  footer.setAttribute("prefix-class", "site-footer__prefix");
  footer.setAttribute("inner-class", "site-footer__inner");
  footer.setAttribute("wrapper-class", "site-footer__layout");
  if (themeAttribute) {
    footer.setAttribute("theme-switcher", "button");
    footer.setAttribute("theme-config", JSON.stringify({
      attribute: themeAttribute, ariaLabel: "Toggle theme", modes: ["light", "dark"], initialMode: "light",
    }));
  }
}
