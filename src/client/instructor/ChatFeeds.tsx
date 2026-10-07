import type { InstructorTeamView, InstructorView, MessageView } from '@shared/views';
import { formatQuantity } from '@shared/units';
import { Button, type Say } from '../ui';
import type { SendCommand } from '../net';

/**
 * One chat feed per world, with mute beside the team that wrote the message
 * (SPEC 8.4).
 *
 * The feeds are separate because the channels are: a message belongs to one
 * world's three countries and nobody else, and keeping them apart on screen is
 * the same shape as the rule on the server.
 *
 * Mute sits here rather than only in the grid because this is where a teacher
 * sees the reason to use it.
 */
export interface ChatFeedsProps {
  view: InstructorView;
  send: SendCommand;
  onSaid: Say;
}

function messageWords(message: MessageView): string {
  if (message.kind === 'pledge' && message.tenths !== undefined) {
    return `Promises ${formatQuantity(message.tenths)} million barrels.`;
  }
  return message.text;
}

function Feed({
  worldNumber,
  messages,
  teams,
  onMute,
}: {
  worldNumber: number;
  messages: MessageView[];
  teams: InstructorTeamView[];
  onMute(team: InstructorTeamView): void;
}) {
  return (
    <section className="chat-feed" aria-labelledby={`chat-${String(worldNumber)}`}>
      <h3 id={`chat-${String(worldNumber)}`}>{`World ${String(worldNumber)}`}</h3>

      <div className="chat-mutes">
        {teams.map((team) => (
          <Button key={team.teamId} onClick={() => onMute(team)}>
            {team.muted ? `Unmute ${team.countryName}` : `Mute ${team.countryName}`}
          </Button>
        ))}
      </div>

      {messages.length === 0 ? (
        <p className="hint">Nothing said in this world yet.</p>
      ) : (
        <ol className="message-list">
          {messages.map((message) => (
            <li className={`message message-${message.kind}`} key={message.messageId}>
              <span className="message-who">{message.countryName ?? 'You'}</span>
              {message.kind === 'pledge' && <span className="message-tag">Promise</span>}
              <span className="message-text">{messageWords(message)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function ChatFeeds({ view, send, onSaid }: ChatFeedsProps) {
  const onMute = async (team: InstructorTeamView) => {
    const ack = await send(team.muted ? 'unmuteTeam' : 'muteTeam', { teamId: team.teamId });
    onSaid(
      ack.ok ? `${team.label} is ${team.muted ? 'able to write again' : 'muted'}.` : ack.message,
      ack.ok ? 'good' : 'bad',
    );
  };

  return (
    <section className="panel chat-panel" aria-labelledby="chat-heading">
      <h2 id="chat-heading">What the worlds are saying</h2>
      <p className="hint">
        Each world has its own channel. Teams never see another world&rsquo;s messages, and never
        see each other&rsquo;s names.
      </p>
      <div className="chat-feeds">
        {view.worlds.map((world) => (
          <Feed
            key={world.worldId}
            worldNumber={world.worldNumber}
            messages={view.messagesByWorld[world.worldId] ?? []}
            teams={view.teams.filter((team) => team.worldId === world.worldId)}
            onMute={(team) => void onMute(team)}
          />
        ))}
      </div>
    </section>
  );
}
