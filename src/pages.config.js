import ARESGroups from './pages/ARESGroups';
import Dashboard from './pages/Dashboard';
import Deployments from './pages/Deployments';
import LocationTasks from './pages/LocationTasks';
import Locations from './pages/Locations';
import Members from './pages/Members';
import MyAssignments from './pages/MyAssignments';
import Profile from './pages/Profile';
import Templates from './pages/Templates';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ARESGroups": ARESGroups,
    "Dashboard": Dashboard,
    "Deployments": Deployments,
    "LocationTasks": LocationTasks,
    "Locations": Locations,
    "Members": Members,
    "MyAssignments": MyAssignments,
    "Profile": Profile,
    "Templates": Templates,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};