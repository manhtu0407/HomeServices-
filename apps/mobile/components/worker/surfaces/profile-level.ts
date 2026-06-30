// Worker profile-level model builders, extracted from worker-surfaces.tsx (C4 stage 5b).
import type { WorkerProfileResponse } from '@/lib/api-types'
import type { WorkerLanguageMode, WorkerProfileLevelMilestone, WorkerProfileLevelMilestoneState, WorkerProfileLevelModel, WorkerProfileLevelSignal } from './types'

export const workerProfileLevelMax = 10
export const workerProfileLevelThresholds = [0, 15, 30, 50, 100, 160, 240, 340, 460, 600] as const

export function buildWorkerProfileLevelModel(
  workerProfile: WorkerProfileResponse | null,
  language: WorkerLanguageMode,
): WorkerProfileLevelModel {
  const completedJobs = Math.max(0, workerProfile?.total_jobs ?? 0)
  const rawRating = Number(workerProfile?.rating ?? 0)
  const hasRating = completedJobs > 0 && Number.isFinite(rawRating) && rawRating > 0
  const rating = hasRating ? Math.min(5, Math.max(1, rawRating)) : 0
  const points = workerProfile ? completedJobs : 0
  let levelIndex = 0
  for (let index = 0; index < workerProfileLevelThresholds.length; index += 1) {
    if (points >= workerProfileLevelThresholds[index]) levelIndex = index
  }
  const level = levelIndex + 1
  const currentFloor = workerProfileLevelThresholds[levelIndex] ?? 0
  const nextThreshold = workerProfileLevelThresholds[levelIndex + 1] ?? currentFloor
  const span = Math.max(1, nextThreshold - currentFloor)
  const progress = nextThreshold > currentFloor ? Math.min(1, Math.max(0, (points - currentFloor) / span)) : 1
  const titles = workerProfileLevelTitles(language)
  const title = workerProfile ? titles[levelIndex] ?? titles[titles.length - 1] : language === 'en' ? 'Profile pending' : 'Chờ hồ sơ thợ'
  const nextTitle = titles[levelIndex + 1] ?? null
  const nextLabel = !workerProfile
    ? language === 'en'
      ? 'Submit verification to start earning level progress.'
      : 'Hoàn tất xác minh để bắt đầu tích lũy cấp thợ.'
    : !nextTitle
      ? language === 'en'
        ? 'You are at the highest visible level for this phase.'
        : 'Bạn đang ở cấp cao nhất trong giai đoạn này.'
      : completedJobs === 0
        ? language === 'en'
          ? 'Finish your first real job to start progress.'
          : 'Hoàn tất việc đầu tiên để bắt đầu tiến trình.'
        : language === 'en'
          ? `${Math.max(1, nextThreshold - points)} completed jobs to reach ${nextTitle}.`
          : `${Math.max(1, nextThreshold - points)} việc hoàn tất nữa để lên ${nextTitle}.`
  const body = !workerProfile
    ? language === 'en'
      ? 'Your level will use real completed jobs and customer feedback only.'
      : 'Cấp thợ chỉ dùng việc hoàn tất và phản hồi thật.'
    : completedJobs === 0
      ? language === 'en'
        ? 'Complete jobs and earn real feedback to build recommendation signals.'
        : 'Hoàn tất việc và nhận phản hồi thật để xây tín hiệu đề xuất.'
      : language === 'en'
        ? 'Kael ranks with feedback, service fit, area, and availability; total jobs help break ties.'
        : 'Kael xếp hạng bằng phản hồi, kỹ năng, khu vực và trạng thái nhận việc; số việc hỗ trợ khi cần phân hạng.'
  const recommendationPercent = workerProfile ? Math.round(progress * 100) : 0
  const hasCompletedJobs = completedJobs > 0
  const emptySignalValue = language === 'en' ? 'Not yet' : 'Ch\u01b0a c\u00f3'
  const signals: WorkerProfileLevelSignal[] = [
    {
      id: 'jobs',
      label: language === 'en' ? 'Completed jobs' : 'Việc hoàn tất',
      value: hasCompletedJobs ? `${completedJobs}` : emptySignalValue,
    },
    {
      id: 'rating',
      label: language === 'en' ? 'Feedback' : 'Phản hồi',
      value: hasRating ? `${rating.toFixed(1)}/5` : emptySignalValue,
    },
    {
      id: 'recommendation',
      label: language === 'en' ? 'Ranking signal' : 'Tín hiệu đề xuất',
      value: hasCompletedJobs ? `${recommendationPercent}%` : emptySignalValue,
    },
  ]
  const milestones = buildWorkerProfileLevelMilestones({
    currentLevel: workerProfile ? level : 0,
    language,
    titles,
  })

  return {
    body,
    currentFloor,
    level,
    milestones,
    nextLabel,
    nextThreshold,
    points,
    progress,
    signals,
    title,
  }
}

export function workerProfileLevelTitles(language: WorkerLanguageMode) {
  return language === 'en'
    ? ['New worker', 'Steady worker', 'Trusted worker', 'Standout worker', 'Elite worker', 'Level 6', 'Level 7', 'Level 8', 'Level 9', 'Level 10']
    : ['Thợ mới', 'Thợ vững tay', 'Thợ tin cậy', 'Thợ nổi bật', 'Thợ tinh nhuệ', 'Cấp 6', 'Cấp 7', 'Cấp 8', 'Cấp 9', 'Cấp 10']
}

export function buildWorkerProfileLevelMilestones({
  currentLevel,
  language,
  titles,
}: {
  currentLevel: number
  language: WorkerLanguageMode
  titles: string[]
}): WorkerProfileLevelMilestone[] {
  return workerProfileLevelThresholds.map((threshold, index) => {
    const level = index + 1
    const requirementVisible = level <= 4 || level <= currentLevel || (currentLevel >= 5 && level === currentLevel + 1)
    const rewardVisible = level <= 4
    const state = workerProfileLevelMilestoneState(level, currentLevel, requirementVisible)

    return {
      level,
      requirement: requirementVisible ? workerProfileLevelRequirement(level, threshold, language) : '????',
      reward: rewardVisible ? workerProfileLevelReward(level, language) : '????',
      state,
      stateLabel: workerProfileLevelStateLabel(state, language),
      title: requirementVisible ? titles[index] ?? `${language === 'en' ? 'Level' : 'Cấp'} ${level}` : `${language === 'en' ? 'Level' : 'Cấp'} ${level}`,
    }
  })
}

export function workerProfileLevelMilestoneState(
  level: number,
  currentLevel: number,
  requirementVisible: boolean,
): WorkerProfileLevelMilestoneState {
  if (!requirementVisible) return 'mystery'
  if (level < currentLevel) return 'reached'
  if (level === currentLevel) return 'current'
  if (level === currentLevel + 1) return 'next'
  return 'open'
}

export function workerProfileLevelStateLabel(state: WorkerProfileLevelMilestoneState, language: WorkerLanguageMode) {
  if (state === 'current') return language === 'en' ? 'Current' : 'Hiện tại'
  if (state === 'reached') return language === 'en' ? 'Unlocked' : 'Đã mở'
  if (state === 'next') return language === 'en' ? 'Next' : 'Tiếp theo'
  if (state === 'mystery') return '????'
  return language === 'en' ? 'Path' : 'Lộ trình'
}

export function workerProfileLevelRequirement(level: number, threshold: number, language: WorkerLanguageMode) {
  if (level === 1) {
    return language === 'en'
      ? 'Complete verification and start receiving real jobs.'
      : 'Hoàn tất xác minh và bắt đầu nhận việc thật.'
  }

  return language === 'en'
    ? `${threshold} completed jobs with honest customer feedback.`
    : `${threshold} việc hoàn tất cùng phản hồi thật.`
}

export function workerProfileLevelReward(level: number, language: WorkerLanguageMode) {
  const rewards = language === 'en'
    ? [
        'Level progress opens.',
        'Steadier profile signal.',
        'Stronger recommendation signal when area and skills fit.',
        'Better tie-break signal against similar profiles.',
      ]
    : [
        'Mở tiến trình cấp thợ.',
        'Tín hiệu hồ sơ ổn định hơn.',
        'Tín hiệu đề xuất mạnh hơn khi đúng khu vực và kỹ năng.',
        'Tín hiệu phân hạng tốt hơn khi hồ sơ tương đương.',
      ]

  return rewards[level - 1] ?? '????'
}
