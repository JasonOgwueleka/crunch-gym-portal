import { Route, Routes } from 'react-router-dom';
import Layout, { RequireRole } from './components/Layout.jsx';
import { Home, NotFound, Plans, Timetable, Trainers } from './pages/public/PublicPages.jsx';
import { ForgotPassword, Login, Register, ResetPassword } from './pages/public/AuthPages.jsx';
import MemberDashboard from './pages/member/Dashboard.jsx';
import Membership from './pages/member/Membership.jsx';
import MemberClasses from './pages/member/Classes.jsx';
import Training from './pages/member/Training.jsx';
import Workouts from './pages/member/Workouts.jsx';
import Progress from './pages/member/Progress.jsx';
import Health from './pages/member/Health.jsx';
import Messages from './pages/shared/Messages.jsx';
import Profile from './pages/shared/Profile.jsx';
import {
  Availability, Certifications, ClientDetail, ClientList, TrainerClasses, TrainerHome, TrainerSessions,
} from './pages/trainer/TrainerPages.jsx';
import FrontDesk from './pages/desk/FrontDesk.jsx';
import {
  AdminAssignments, AdminAudit, AdminCertifications, AdminCheckins, AdminClasses, AdminDashboard,
  AdminMemberships, AdminPayments, AdminPlans, AdminReports, AdminUsers,
} from './pages/admin/AdminPages.jsx';

const only = (roles, el) => <RequireRole roles={roles}>{el}</RequireRole>;

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Visitor */}
        <Route index element={<Home />} />
        <Route path="plans" element={<Plans />} />
        <Route path="timetable" element={<Timetable />} />
        <Route path="trainers" element={<Trainers />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />

        {/* Any logged-in user */}
        <Route path="profile" element={only(null, <Profile />)} />
        <Route path="messages" element={only(['member', 'trainer'], <Messages />)} />

        {/* Member */}
        <Route path="dashboard" element={only(['member'], <MemberDashboard />)} />
        <Route path="membership" element={only(['member'], <Membership />)} />
        <Route path="classes" element={only(['member'], <MemberClasses />)} />
        <Route path="training" element={only(['member'], <Training />)} />
        <Route path="workouts" element={only(['member'], <Workouts />)} />
        <Route path="progress" element={only(['member'], <Progress />)} />
        <Route path="health" element={only(['member'], <Health />)} />

        {/* Personal trainer */}
        <Route path="trainer" element={only(['trainer'], <TrainerHome />)} />
        <Route path="trainer/clients" element={only(['trainer'], <ClientList />)} />
        <Route path="trainer/clients/:memberId" element={only(['trainer', 'admin'], <ClientDetail />)} />
        <Route path="trainer/availability" element={only(['trainer'], <Availability />)} />
        <Route path="trainer/sessions" element={only(['trainer'], <TrainerSessions />)} />
        <Route path="trainer/classes" element={only(['trainer'], <TrainerClasses />)} />
        <Route path="trainer/certifications" element={only(['trainer'], <Certifications />)} />

        {/* Front desk */}
        <Route path="desk" element={only(['front_desk', 'admin'], <FrontDesk />)} />

        {/* Admin */}
        <Route path="admin" element={only(['admin'], <AdminDashboard />)} />
        <Route path="admin/users" element={only(['admin'], <AdminUsers />)} />
        <Route path="admin/plans" element={only(['admin'], <AdminPlans />)} />
        <Route path="admin/memberships" element={only(['admin'], <AdminMemberships />)} />
        <Route path="admin/payments" element={only(['admin'], <AdminPayments />)} />
        <Route path="admin/assignments" element={only(['admin'], <AdminAssignments />)} />
        <Route path="admin/classes" element={only(['admin'], <AdminClasses />)} />
        <Route path="admin/sessions" element={only(['admin'], <TrainerSessions admin />)} />
        <Route path="admin/certifications" element={only(['admin'], <AdminCertifications />)} />
        <Route path="admin/checkins" element={only(['admin'], <AdminCheckins />)} />
        <Route path="admin/audit" element={only(['admin'], <AdminAudit />)} />
        <Route path="admin/reports" element={only(['admin'], <AdminReports />)} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
