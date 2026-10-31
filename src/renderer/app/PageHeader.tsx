import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  description?: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className="title-1">{title}</h1>
      {description && <p className={styles.description}>{description}</p>}
    </header>
  );
}
