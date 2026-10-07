import { createContext, useContext } from 'react';

// Navigation interne : route = { page, id?, ... }
export const NavCtx = createContext(() => {});
export const useNav = () => useContext(NavCtx);
