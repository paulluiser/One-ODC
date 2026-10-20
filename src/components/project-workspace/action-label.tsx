import { ChevronRight, type LucideIcon } from "lucide-react";
import styles from "./workspace.module.css";
export function ProjectActionLabel({
  icon: Icon,
  title,
  description,
  descriptionId,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  descriptionId?: string;
}) {
  return (
    <span className={styles.actionLabel}>
      <Icon size={18} aria-hidden="true" />
      <span className={styles.actionText}>
        <span>{title}</span>
        {description && <small id={descriptionId}>{description}</small>}
      </span>
      <ChevronRight size={16} aria-hidden="true" />
    </span>
  );
}
