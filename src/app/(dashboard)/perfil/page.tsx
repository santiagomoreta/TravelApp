import { requireUser } from "@/features/auth/session";
import { ProfileForm, SignOutButton } from "@/features/auth/auth-form";
import { getProfileName } from "@/features/auth/profile";

export default async function ProfilePage() {
  const user = await requireUser();
  const name = await getProfileName(user);
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MI ESPACIO PERSONAL</span>
          <h1>Tu perfil</h1>
        </div>
      </div>
      <ProfileForm name={name} email={user.email || ""} />
      <div className="profile-signout">
        <SignOutButton />
      </div>
    </div>
  );
}
