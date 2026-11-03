import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Bot, CircleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type {
  AgentEvent,
  AgentQuestion,
  AgentReport,
  AgentTask,
} from '../../shared/contracts/agent-tasks.ts';
import { ActivityItem } from '../components/ActivityItem/ActivityItem.tsx';
import { Avatar } from '../components/Avatar/Avatar.tsx';
import { Button } from '../components/Button/Button.tsx';
import { Checkbox } from '../components/Checkbox/Checkbox.tsx';
import { StatusPill } from '../components/StatusPill/StatusPill.tsx';
import { TextField } from '../components/TextField/TextField.tsx';
import {
  isAgentActive,
  useAgentActivity,
  useAgentTaskAction,
  useAnswerAgentQuestion,
} from '../hooks/useAgentTasks.ts';
import styles from './AgentActivity.module.css';
import { agentStatus } from './agentStatus.ts';
import { relativeTime } from './relativeTime.ts';

// The feed shows this many of the latest steps.
const FEED_LENGTH = 30;

const outcomeLabels: Record<AgentReport['items'][number]['outcome'], string> = {
  fixed: 'Fixed',
  not_fixed: 'Not fixed',
  needs_input: 'Needs your input',
};

export interface AgentActivityProps {
  // The pull request's latest task.
  task: AgentTask;
}

// What the agent is doing on a pull request: its state, its question for you, its report and
// a feed of its steps. Lets you stop, force stop or resume it.
export function AgentActivity({ task }: AgentActivityProps) {
  const active = isAgentActive(task) || task.status === 'waiting';
  const { data: events = [] } = useAgentActivity(task.id, active);
  const action = useAgentTaskAction();
  const run = (name: 'stop' | 'forceStop' | 'resume' | 'push' | 'investigate') =>
    action.mutate({ action: name, taskId: task.id });
  const pending = (name: string) => action.isPending && action.variables?.action === name;

  return (
    <section className={styles.agent} aria-label="Agent activity">
      <div className={styles.header}>
        <h4 className="title-3">Agent Activity</h4>
        <StatusPill status={agentStatus[task.status]} />
      </div>
      {task.question && <QuestionForm question={task.question} />}
      {task.status === 'failed' && task.error && (
        <p className={styles.error} role="alert">
          <CircleAlert aria-hidden />
          {task.error}
        </p>
      )}
      {task.report && <Report report={task.report} />}
      {task.status === 'completed' && task.push && <Push push={task.push} ci={task.ci} />}
      {events.length > 0 && <Feed events={events.slice(-FEED_LENGTH)} />}
      <div className={styles.actions}>
        {(task.status === 'queued' || task.status === 'running' || task.status === 'waiting') && (
          <Button size="sm" loading={pending('stop')} onClick={() => run('stop')}>
            Stop
          </Button>
        )}
        {task.status === 'running' && (
          <Button size="sm" variant="plain" tone="danger" onClick={() => run('forceStop')}>
            Force Stop
          </Button>
        )}
        {task.status === 'completed' &&
          (task.push?.status === 'waiting' || task.push?.status === 'blocked') && (
            <Button size="sm" loading={pending('push')} onClick={() => run('push')}>
              {task.push.status === 'waiting' ? 'Push Changes' : 'Try Again'}
            </Button>
          )}
        {task.status === 'completed' && task.ci?.status === 'failed' && (
          <Button size="sm" loading={pending('investigate')} onClick={() => run('investigate')}>
            Investigate with Claude
          </Button>
        )}
        {(task.status === 'stopped' || task.status === 'failed') && (
          <Button size="sm" onClick={() => run('resume')}>
            Resume
          </Button>
        )}
      </div>
    </section>
  );
}

function Feed({ events }: { events: AgentEvent[] }) {
  return (
    <ol className={styles.feed}>
      {events.map((event, index) => {
        const fromYou = event.kind === 'answer';
        const fromApp = event.kind === 'status' || event.kind === 'error';
        return (
          <ActivityItem
            key={event.id}
            author={fromYou ? 'You' : fromApp ? 'PReview' : 'Claude'}
            time={relativeTime(event.createdAt)}
            dateTime={event.createdAt}
            highlighted={fromYou}
            last={index === events.length - 1}
            avatar={
              fromYou || fromApp ? (
                <Avatar
                  name={fromYou ? 'You' : 'PReview'}
                  tone="accent"
                  shape={fromApp ? 'rounded' : 'circle'}
                  size="sm"
                />
              ) : (
                <Avatar name="Claude" icon={<Bot aria-hidden />} size="sm" />
              )
            }
          >
            <p className={styles.summary}>{event.summary}</p>
            {event.detail && (
              <details className={styles.detail}>
                <summary>Details</summary>
                <pre>{event.detail}</pre>
              </details>
            )}
          </ActivityItem>
        );
      })}
    </ol>
  );
}

const ciPills = {
  pending: { tone: 'info', label: 'CI Running' },
  passed: { tone: 'success', label: 'CI Passed' },
  failed: { tone: 'danger', label: 'CI Failed' },
} as const;

const checkTones = {
  pending: 'info',
  passed: 'success',
  failed: 'danger',
  skipped: 'neutral',
} as const;

function Push({ push, ci }: { push: NonNullable<AgentTask['push']>; ci: AgentTask['ci'] }) {
  if (push.status === 'waiting') {
    return (
      <p className={styles.note}>
        A test failed or none were reported, so the changes wait for you to push them.
      </p>
    );
  }
  if (push.status === 'no_changes') {
    return <p className={styles.note}>The agent made no changes to push.</p>;
  }
  if (push.status === 'blocked') {
    return (
      <p className={styles.error} role="alert">
        <CircleAlert aria-hidden />
        {push.error ?? "The changes weren't pushed."}
      </p>
    );
  }
  return (
    <div className={styles.report}>
      <div className={styles.header}>
        <span>
          Pushed <code className={styles.sha}>{push.sha?.slice(0, 7)}</code>
        </span>
        {ci && (
          <StatusPill size="sm" tone={ciPills[ci.status].tone} icon={null}>
            {ciPills[ci.status].label}
          </StatusPill>
        )}
      </div>
      {ci && ci.checks.length > 0 && (
        <ul className={styles.items}>
          {ci.checks.map((check) => (
            <li key={check.name}>
              <StatusPill size="sm" tone={checkTones[check.state]} icon={null}>
                {check.state[0]!.toUpperCase() + check.state.slice(1)}
              </StatusPill>
              {check.url ? (
                <a href={check.url} target="_blank" rel="noreferrer">
                  {check.name}
                </a>
              ) : (
                <span>{check.name}</span>
              )}
              {check.required && <span className={styles.required}>Required</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Report({ report }: { report: AgentReport }) {
  return (
    <div className={styles.report}>
      <p className={styles.summary}>{report.summary}</p>
      {report.items.length > 0 && (
        <ul className={styles.items}>
          {report.items.map((item) => (
            <li key={item.id}>
              <span className={styles.itemId}>{item.id}</span>
              <StatusPill
                size="sm"
                tone={
                  item.outcome === 'fixed'
                    ? 'success'
                    : item.outcome === 'needs_input'
                      ? 'warning'
                      : 'danger'
                }
                icon={null}
              >
                {outcomeLabels[item.outcome]}
              </StatusPill>
              <span>{item.note}</span>
            </li>
          ))}
        </ul>
      )}
      {report.tests.length > 0 && (
        <ul className={styles.items}>
          {report.tests.map((test) => (
            <li key={test.command}>
              <StatusPill size="sm" tone={test.passed ? 'success' : 'danger'} icon={null}>
                {test.passed ? 'Passed' : 'Failed'}
              </StatusPill>
              <code>{test.command}</code>
              <span>{test.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuestionForm({ question }: { question: AgentQuestion }) {
  const answer = useAnswerAgentQuestion();
  // Chosen options, and answers in your own words, by question text.
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [written, setWritten] = useState<Record<string, string>>({});
  const answers = Object.fromEntries(
    question.questions.map(({ question: text }) => [
      text,
      written[text]?.trim() || (chosen[text] ?? []).join(', '),
    ]),
  );
  const complete = Object.values(answers).every(Boolean);
  const gone = answer.data === false;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (complete) answer.mutate({ questionId: question.id, answers });
  };

  return (
    <form className={styles.question} onSubmit={submit}>
      {question.questions.map((item) => (
        <fieldset key={item.question} className={styles.fieldset}>
          <legend className="headline">{item.header ?? 'Question'}</legend>
          <p className={styles.prompt}>{item.question}</p>
          {item.options.length > 0 &&
            (item.multiSelect ? (
              <div className={styles.options}>
                {item.options.map((option) => (
                  <Checkbox
                    key={option.label}
                    label={<OptionLabel {...option} />}
                    checked={(chosen[item.question] ?? []).includes(option.label)}
                    onCheckedChange={(checked) =>
                      setChosen((current) => {
                        const previous = current[item.question] ?? [];
                        return {
                          ...current,
                          [item.question]: checked
                            ? [...previous, option.label]
                            : previous.filter((label) => label !== option.label),
                        };
                      })
                    }
                  />
                ))}
              </div>
            ) : (
              <RadioGroup
                className={styles.options}
                aria-label={item.question}
                value={chosen[item.question]?.[0] ?? ''}
                onValueChange={(value) =>
                  setChosen((current) => ({ ...current, [item.question]: [String(value)] }))
                }
              >
                {item.options.map((option) => (
                  <label key={option.label} className={styles.option}>
                    <Radio.Root value={option.label} className={styles.radio}>
                      <Radio.Indicator className={styles.radioDot} />
                    </Radio.Root>
                    <OptionLabel {...option} />
                  </label>
                ))}
              </RadioGroup>
            ))}
          <TextField
            label={item.options.length > 0 ? 'Or answer in your own words' : 'Your answer'}
            value={written[item.question] ?? ''}
            onChange={(event) =>
              setWritten((current) => ({ ...current, [item.question]: event.target.value }))
            }
          />
        </fieldset>
      ))}
      {(gone || answer.isError) && (
        <p className={styles.error} role="alert">
          <CircleAlert aria-hidden />
          {gone ? 'The agent is no longer waiting for this answer.' : 'Could not send. Try again.'}
        </p>
      )}
      <div className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={answer.isPending}
          disabled={!complete}
        >
          Send Answer
        </Button>
      </div>
    </form>
  );
}

function OptionLabel({ label, description }: { label: string; description: string | null }) {
  return (
    <span className={styles.optionText}>
      <span>{label}</span>
      {description && <span className={styles.optionDescription}>{description}</span>}
    </span>
  );
}
