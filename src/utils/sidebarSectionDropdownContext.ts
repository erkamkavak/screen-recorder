export type SidebarSectionDropdownContext = {
  register: () => void;
  unregister: () => void;
};

export const sidebarSectionDropdownKey = Symbol("sidebar-section-dropdown");
