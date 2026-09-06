import type {
  NotificationActionKind,
  NotificationTarget
} from '@/domain/notifications';
import { assistantConversationDestination } from '@/features/shell/navigation-context';
import type {
  NotificationService,
  PhoneNotificationResponse,
  PhoneNotificationService
} from '@/services/contracts/assistant-notifications-service';

type ResponseNotificationService = Pick<
  NotificationService,
  'executeAction' | 'resolveTarget' | 'revalidateAction'
>;
type ResponsePhoneService = Pick<
  PhoneNotificationService,
  'getLastResponse' | 'subscribeToResponses'
>;

export type NotificationResponseController = {
  handle(response: PhoneNotificationResponse): Promise<void>;
  start(): Promise<void>;
  stop(): void;
};

export function createNotificationResponseController({
  notificationService,
  phoneService,
  navigate,
  unlock: requestUnlock
}: {
  notificationService: ResponseNotificationService;
  phoneService: ResponsePhoneService;
  navigate: (destination: string) => void;
  unlock: () => Promise<boolean>;
}): NotificationResponseController {
  let unsubscribe: (() => void) | null = null;
  const handledResponses = new Map<string, Promise<void>>();
  const executions = new Map<string, Promise<void>>();

  const revalidateAction: NotificationService['revalidateAction'] = (id, action) =>
    notificationService.revalidateAction(id, action);
  const executeAction: NotificationService['executeAction'] = (id, action, operationId) =>
    notificationService['executeAction'](id, action, operationId);

  async function runResponse(response: PhoneNotificationResponse) {
    const targetResolution = await notificationService.resolveTarget(response.notificationId);
    if (targetResolution.status === 'unavailable' || !targetResolution.target) {
      navigate('/notifications');
      return;
    }

    if (targetResolution.status === 'unlock_required' && !(await requestUnlock())) {
      navigate('/notifications');
      return;
    }

    let actionResolution = await revalidateAction(
      response.notificationId,
      response.action
    );
    if (actionResolution.status === 'unlock_required') {
      if (!(await requestUnlock())) {
        navigate('/notifications');
        return;
      }
      actionResolution = await revalidateAction(
        response.notificationId,
        response.action
      );
    }

    if (actionResolution.status !== 'available' || !actionResolution.target) {
      navigate('/notifications');
      return;
    }

    if (response.action === 'undo') {
      const operationId = `notification-response-${response.notificationId}-${response.action}`;
      let execution = executions.get(operationId);
      if (!execution) {
        execution = protectedNotificationAction({
            id: response.notificationId,
            action: response.action,
            operationId,
            unlock: requestUnlock,
            revalidateAction,
            executeAction
          })
          .then(() => undefined)
          .catch((error) => {
            executions.delete(operationId);
            throw error;
          });
        executions.set(operationId, execution);
      }
      await execution;
      return;
    }

    navigate(routeForTarget(actionResolution.target, response.action) ?? '/notifications');
  }

  async function handle(response: PhoneNotificationResponse) {
    const key = `${response.notificationId}:${response.action}`;
    const replay = handledResponses.get(key);
    if (replay) return replay;
    const result = runResponse(response).catch(() => {
      handledResponses.delete(key);
      navigate('/notifications');
    });
    handledResponses.set(key, result);
    return result;
  }

  return {
    async handle(response) {
      await handle(response);
    },
    async start() {
      if (unsubscribe) return;
      unsubscribe = phoneService.subscribeToResponses((response) => {
        void handle(response);
      });
      const response = await phoneService.getLastResponse();
      if (response) await handle(response);
    },
    stop() {
      unsubscribe?.();
      unsubscribe = null;
    }
  };
}

type ProtectedActionOptions = {
  id: string;
  action: 'undo';
  operationId: string;
  unlock: () => Promise<boolean>;
  revalidateAction: NotificationService['revalidateAction'];
  executeAction: NotificationService['executeAction'];
};

async function protectedNotificationAction(options: ProtectedActionOptions) {
  const id = options.id;
  const action = options.action;
  const operationId = options.operationId;
  const unlock = options.unlock;
  const revalidateAction = options.revalidateAction;
  const executeAction = options.executeAction;
  const unlocked = await unlock();
  const actionResolution = await revalidateAction(id, action);
  return unlocked && actionResolution.status === 'available' && actionResolution.target
    ? executeAction(id, action, operationId)
    : Promise.reject(new Error(actionResolution.status));
}

function routeForTarget(target: NotificationTarget, action: Exclude<NotificationActionKind, 'undo'>): string | null {
  if (target.kind === 'account') return path('/accounts', target.accountId, action === 'edit');
  if (target.kind === 'transaction') return path('/transactions', target.transactionId, action === 'edit');
  if (target.kind === 'review') return path('/tracking/review', target.reviewId);
  if (target.kind === 'obligation') return path('/obligations', target.obligationId, action === 'edit');
  if (target.kind === 'budget') return action === 'edit'
    ? path('/budgets/edit', target.budgetId)
    : path('/budgets', target.budgetId);
  if (target.kind === 'salary') return action === 'edit' ? '/salary/profile' : '/salary';
  if (target.kind === 'goal') return path('/savings', target.goalId, action === 'edit');
  if (target.kind === 'report') return '/reports';
  if (target.kind === 'assistant') return assistantConversationDestination(target.conversationId);
  if (target.kind === 'security') return '/security/events';
  if (target.key === 'notifications') return '/notifications/preferences';
  if (target.key === 'security') return '/security/settings';
  return '/profile/privacy';
}

function path(prefix: string, id: string, edit = false): string | null {
  return /^[A-Za-z0-9_-]+$/.test(id) ? `${prefix}/${id}${edit ? '/edit' : ''}` : null;
}
