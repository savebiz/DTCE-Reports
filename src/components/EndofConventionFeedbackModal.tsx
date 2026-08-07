'use client'

import React, { useState } from 'react'
import { Star, X, Check, HelpCircle, MessageSquare } from 'lucide-react'
import { showToast } from '@/components/ui/toast'

interface FeedbackModalProps {
  isOpen: boolean
  profileId: string
  onCloseSession: () => void
  onSubmitSuccess: () => void
}

export function EndofConventionFeedbackModal({
  isOpen,
  profileId,
  onCloseSession,
  onSubmitSuccess
}: FeedbackModalProps) {
  // Form State
  const [overallSatisfaction, setOverallSatisfaction] = useState<number | null>(null)
  const [dailyReportEase, setDailyReportEase] = useState<number | null>(null)
  const [requisitionEase, setRequisitionEase] = useState<number | null>(null)
  const [vsPaperProcess, setVsPaperProcess] = useState<string | null>(null)
  const [encounteredBugs, setEncounteredBugs] = useState<boolean | null>(null)
  const [bugsDescription, setBugsDescription] = useState('')
  const [mobileExperienceRating, setMobileExperienceRating] = useState<number | null | 'computer'>(null)
  const [npsScore, setNpsScore] = useState<number | null>(null)
  const [topImprovement, setTopImprovement] = useState('')
  const [additionalComments, setAdditionalComments] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [hoverStar, setHoverStar] = useState<number | null>(null)

  if (!isOpen) return null

  const paperOptions = [
    { value: 'much_harder', label: 'Much harder' },
    { value: 'harder', label: 'Harder' },
    { value: 'about_the_same', label: 'About the same' },
    { value: 'easier', label: 'Easier' },
    { value: 'much_easier', label: 'Much easier' }
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!overallSatisfaction) {
      showToast('Please select your overall satisfaction rating.', 'error')
      return
    }
    if (!dailyReportEase) {
      showToast('Please rate Daily Report submission ease.', 'error')
      return
    }
    if (!requisitionEase) {
      showToast('Please rate Materials Requisition ease.', 'error')
      return
    }
    if (!vsPaperProcess) {
      showToast('Please select how the platform compares to the paper process.', 'error')
      return
    }
    if (encounteredBugs === null) {
      showToast('Please indicate whether you encountered any bugs.', 'error')
      return
    }
    if (npsScore === null) {
      showToast('Please select your likelihood to recommend (0-10).', 'error')
      return
    }
    if (!topImprovement.trim()) {
      showToast('Please tell us the one thing we should improve before the next convention.', 'error')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: profileId,
          overall_satisfaction: overallSatisfaction,
          daily_report_ease: dailyReportEase,
          requisition_ease: requisitionEase,
          vs_paper_process: vsPaperProcess,
          encountered_bugs: encounteredBugs,
          bugs_description: encounteredBugs ? bugsDescription : null,
          mobile_experience_rating: mobileExperienceRating === 'computer' ? null : mobileExperienceRating,
          nps_score: npsScore,
          top_improvement: topImprovement,
          additional_comments: additionalComments
        })
      })

      const data = await res.json()
      if (data.success) {
        showToast('Thank you! Your feedback has been recorded.', 'success')
        onSubmitSuccess()
      } else {
        showToast(`Error submitting feedback: ${data.error}`, 'error')
      }
    } catch (err: any) {
      showToast(`Failed to submit feedback: ${err.message}`, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col text-foreground font-sans">
        
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">End-of-Convention Feedback</h2>
              <p className="text-[11px] text-muted-foreground">Your voice shapes the next convention platform experience</p>
            </div>
          </div>
          <button
            onClick={onCloseSession}
            type="button"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            title="Close for this session"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-6 flex-1 text-xs">

          {/* Q1: Overall Satisfaction (1-5 Star Rating) */}
          <div className="space-y-2 p-4 rounded-xl bg-muted/10 border border-border/50">
            <label className="font-bold text-foreground block text-xs">
              1. Overall satisfaction with the DTCE Convention Platform <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2 py-1">
              {[1, 2, 3, 4, 5].map((star) => {
                const isFilled = (hoverStar !== null ? hoverStar >= star : (overallSatisfaction !== null && overallSatisfaction >= star))
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setOverallSatisfaction(star)}
                    onMouseEnter={() => setHoverStar(star)}
                    onMouseLeave={() => setHoverStar(null)}
                    className="p-1 rounded-md transition-transform hover:scale-110 focus:outline-none"
                  >
                    <Star
                      className={`w-7 h-7 ${
                        isFilled
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-muted-foreground/40 fill-none'
                      }`}
                    />
                  </button>
                )
              })}
              <span className="ml-2 text-xs font-semibold text-amber-400">
                {overallSatisfaction === 1 && '1 — Poor'}
                {overallSatisfaction === 2 && '2 — Fair'}
                {overallSatisfaction === 3 && '3 — Good'}
                {overallSatisfaction === 4 && '4 — Very Good'}
                {overallSatisfaction === 5 && '5 — Excellent'}
              </span>
            </div>
          </div>

          {/* Q2: Daily Report Submission Ease (1-5) */}
          <div className="space-y-2 p-4 rounded-xl bg-muted/10 border border-border/50">
            <label className="font-bold text-foreground block text-xs">
              2. Daily Report submission ease <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-5 gap-2 pt-1">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setDailyReportEase(num)}
                  className={`py-2 rounded-lg border text-center text-xs font-bold transition-all ${
                    dailyReportEase === num
                      ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                      : 'bg-background hover:bg-muted/30 border-border text-muted-foreground'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground pt-1">
              <span>1 = Very Hard</span>
              <span>5 = Very Easy</span>
            </div>
          </div>

          {/* Q3: Materials Requisition Ease (1-5) */}
          <div className="space-y-2 p-4 rounded-xl bg-muted/10 border border-border/50">
            <label className="font-bold text-foreground block text-xs">
              3. Materials Requisition ease <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-5 gap-2 pt-1">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setRequisitionEase(num)}
                  className={`py-2 rounded-lg border text-center text-xs font-bold transition-all ${
                    requisitionEase === num
                      ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                      : 'bg-background hover:bg-muted/30 border-border text-muted-foreground'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground pt-1">
              <span>1 = Very Hard</span>
              <span>5 = Very Easy</span>
            </div>
          </div>

          {/* Q4: Compared to the old paper-based process */}
          <div className="space-y-2 p-4 rounded-xl bg-muted/10 border border-border/50">
            <label className="font-bold text-foreground block text-xs">
              4. Compared to the old paper-based process <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
              {paperOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setVsPaperProcess(opt.value)}
                  className={`p-2 rounded-lg border text-[11px] font-semibold text-center transition-all ${
                    vsPaperProcess === opt.value
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                      : 'bg-background hover:bg-muted/30 border-border text-muted-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Q5: Did you encounter any bugs or unexpected behavior? */}
          <div className="space-y-2 p-4 rounded-xl bg-muted/10 border border-border/50">
            <label className="font-bold text-foreground block text-xs">
              5. Did you encounter any bugs or unexpected behavior? <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setEncounteredBugs(true)}
                className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-all ${
                  encounteredBugs === true
                    ? 'bg-amber-500/20 text-amber-500 border-amber-500'
                    : 'bg-background hover:bg-muted/30 border-border text-muted-foreground'
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => {
                  setEncounteredBugs(false)
                  setBugsDescription('')
                }}
                className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-all ${
                  encounteredBugs === false
                    ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500'
                    : 'bg-background hover:bg-muted/30 border-border text-muted-foreground'
                }`}
              >
                No
              </button>
            </div>

            {encounteredBugs === true && (
              <div className="pt-2 animate-fade-in">
                <label className="text-[11px] text-muted-foreground block mb-1">Tell us more (Optional)</label>
                <textarea
                  value={bugsDescription}
                  onChange={(e) => setBugsDescription(e.target.value)}
                  placeholder="Describe the issue or error you encountered..."
                  rows={2}
                  className="w-full p-2.5 rounded-lg bg-background border border-border text-foreground text-xs outline-none focus:border-amber-500"
                />
              </div>
            )}
          </div>

          {/* Q6: Mobile experience */}
          <div className="space-y-2 p-4 rounded-xl bg-muted/10 border border-border/50">
            <label className="font-bold text-foreground block text-xs">
              6. Mobile experience rating
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setMobileExperienceRating(num)}
                  className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                    mobileExperienceRating === num
                      ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                      : 'bg-background hover:bg-muted/30 border-border text-muted-foreground'
                  }`}
                >
                  {num} ★
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMobileExperienceRating('computer')}
                className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                  mobileExperienceRating === 'computer'
                    ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                    : 'bg-background hover:bg-muted/30 border-border text-muted-foreground'
                }`}
              >
                💻 I mostly used a computer
              </button>
            </div>
          </div>

          {/* Q7: NPS Score (0-10) */}
          <div className="space-y-2 p-4 rounded-xl bg-muted/10 border border-border/50">
            <label className="font-bold text-foreground block text-xs">
              7. Likelihood to recommend this platform for future conventions (0-10) <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-11 gap-1 pt-1">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                <button
                  key={score}
                  type="button"
                  onClick={() => setNpsScore(score)}
                  className={`py-2 rounded-md border text-center text-xs font-bold transition-all ${
                    npsScore === score
                      ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-sm'
                      : 'bg-background hover:bg-muted/30 border-border text-muted-foreground'
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground pt-1">
              <span>0 = Not likely at all</span>
              <span>10 = Extremely likely</span>
            </div>
          </div>

          {/* Q8: Required Top Improvement */}
          <div className="space-y-2 p-4 rounded-xl bg-muted/10 border border-border/50">
            <label className="font-bold text-foreground block text-xs">
              8. What's the one thing we should improve before the next convention? <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              value={topImprovement}
              onChange={(e) => setTopImprovement(e.target.value)}
              placeholder="Share the most important improvement or feature needed..."
              rows={3}
              className="w-full p-2.5 rounded-lg bg-background border border-border text-foreground text-xs outline-none focus:border-amber-500"
            />
          </div>

          {/* Optional Additional Comments */}
          <div className="space-y-2 p-4 rounded-xl bg-muted/10 border border-border/50">
            <label className="font-bold text-foreground block text-xs">
              Anything else you'd like to share? <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <textarea
              value={additionalComments}
              onChange={(e) => setAdditionalComments(e.target.value)}
              placeholder="Any additional thoughts or encouragement..."
              rows={2}
              className="w-full p-2.5 rounded-lg bg-background border border-border text-foreground text-xs outline-none focus:border-amber-500"
            />
          </div>

          {/* Form Actions */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-3 border-t border-border">
            <button
              type="button"
              onClick={onCloseSession}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 font-semibold transition-all text-xs cursor-pointer"
            >
              Remind Me Later
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-slate-950 font-bold transition-all text-xs cursor-pointer shadow-md flex items-center justify-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)' }}
            >
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>

        </form>

      </div>
    </div>
  )
}
