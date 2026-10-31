import styles from './ImageDiff.module.css';

export interface ImageDiffProps {
  path: string;
  // Data URLs. null when the image does not exist on that side, as in an added or removed file.
  original: string | null;
  modified: string | null;
}

// An image file before and after the pull request, side by side.
export function ImageDiff({ path, original, modified }: ImageDiffProps) {
  const sides = [
    { label: 'Before', src: original },
    { label: 'After', src: modified },
  ].filter((side) => side.src !== null);

  return (
    <div className={styles.diff}>
      {sides.map(({ label, src }) => (
        <figure key={label} className={styles.side}>
          <figcaption className={styles.caption}>{label}</figcaption>
          <div className={styles.frame}>
            <img src={src ?? undefined} alt={`${label}: ${path}`} className={styles.image} />
          </div>
        </figure>
      ))}
    </div>
  );
}
