import type { Repository } from '../../shared/contracts/repositories.ts';

export function repositoryName(repository: Repository): string {
  return repository.github
    ? `${repository.github.owner}/${repository.github.name}`
    : repository.name;
}
