#!/usr/bin/env node

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }
  return value;
}

function signature(value) {
  return JSON.stringify(stable(value));
}

export class RalphStatusReporter {
  constructor({
    emit = (report) => console.log(`RALPH STATUS ${JSON.stringify(report)}`),
    now = () => Date.now(),
    heartbeatMs = 300_000,
  } = {}) {
    if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0) {
      throw new Error('heartbeatMs must be a positive number.');
    }
    this.emit = emit;
    this.now = now;
    this.heartbeatMs = heartbeatMs;
    this.loops = new Map();
    this.lastEventSignatures = new Map();
  }

  reportLaunch(loop, snapshot) {
    this.loops.set(loop.issueNumber, {
      snapshot,
      lastReportAt: this.now(),
    });
    this.#emitOnce('loop-launch', loop, {
      worktreePath: loop.worktreePath,
      snapshot,
    });
  }

  observe(loop, snapshot) {
    const state = this.loops.get(loop.issueNumber);
    if (!state) {
      this.reportLaunch(loop, snapshot);
      return;
    }

    const transitions = [];
    const previous = state.snapshot;
    const completedStories = snapshot.passedStoryIds.filter((storyId) => !previous.passedStoryIds.includes(storyId));
    if (completedStories.length) {
      transitions.push({ type: 'story-completion', storyIds: completedStories });
    }

    const previousPublication = {
      localCommit: previous.localCommit,
      remoteCommit: previous.remoteCommit,
      pullRequestState: previous.pullRequestState,
      pullRequestUrl: previous.pullRequestUrl,
    };
    const publication = {
      localCommit: snapshot.localCommit,
      remoteCommit: snapshot.remoteCommit,
      pullRequestState: snapshot.pullRequestState,
      pullRequestUrl: snapshot.pullRequestUrl,
    };
    if (signature(previousPublication) !== signature(publication)) {
      transitions.push({ type: 'publication-change', ...publication });
    }

    if (previous.ciState !== snapshot.ciState) {
      transitions.push({ type: 'ci-change', from: previous.ciState, to: snapshot.ciState });
    }
    if (previous.monitorError !== snapshot.monitorError && snapshot.monitorError) {
      transitions.push({ type: 'status-monitor-warning', message: snapshot.monitorError });
    } else if (previous.monitorError && !snapshot.monitorError) {
      transitions.push({ type: 'status-monitor-recovered' });
    }

    state.snapshot = snapshot;
    if (transitions.length) {
      state.lastReportAt = this.now();
      this.#emitOnce('meaningful-change', loop, { transitions, snapshot });
      return;
    }

    if (this.now() - state.lastReportAt >= this.heartbeatMs) {
      state.lastReportAt = this.now();
      this.#emitOnce('periodic-heartbeat', loop, {
        heartbeatAt: state.lastReportAt,
        snapshot,
      });
    }
  }

  reportBlocker(loop, blocker, snapshot) {
    this.#emitOnce('blocker', loop, { blocker, snapshot });
  }

  reportCompletion(loop, snapshot) {
    this.#emitOnce('loop-completion', loop, { snapshot });
  }

  #emitOnce(type, loop, details) {
    const report = {
      type,
      issueNumber: loop.issueNumber,
      branchName: loop.branchName,
      at: new Date(this.now()).toISOString(),
      ...details,
    };
    const eventSignature = signature({
      type,
      issueNumber: loop.issueNumber,
      details,
    });
    const eventKey = `${loop.issueNumber}:${type}`;
    if (this.lastEventSignatures.get(eventKey) === eventSignature) return;
    this.lastEventSignatures.set(eventKey, eventSignature);
    this.emit(report);
  }
}
