import Sidebar from "./Sidebar";
import { Outlet } from "react-router-dom";

const SidebarLayout = () => (
  <div className="flex w-full">
    <Sidebar />
    <div className="flex-grow p-4">
      <Outlet />
    </div>
  </div>
);

export default SidebarLayout;