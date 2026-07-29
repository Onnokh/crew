import crewProfile from "../../../assets/crew-profile.png";
import styles from "./crew-avatar.module.scss";

export function CrewAvatar() {
  return (
    <div className={styles.avatarFrame}>
      <img
        className={styles.avatar}
        src={crewProfile}
        alt="Crew profile"
        width={80}
        height={80}
        decoding="async"
      />
    </div>
  );
}
