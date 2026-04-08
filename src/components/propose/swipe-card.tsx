'use client'

import { useState, useRef } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import Image from 'next/image'

interface SwipeCardProps {
  imageUrl: string
  title: string
  index: number
  total: number
  onSwipe: (direction: 'like' | 'pass') => void
}

export function SwipeCard({ imageUrl, title, index, total, onSwipe }: SwipeCardProps) {
  const [swiped, setSwiped] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-300, 0, 300], [-15, 0, 15])
  const likeOpacity = useTransform(x, [0, 100], [0, 1])
  const passOpacity = useTransform(x, [-100, 0], [1, 0])

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    const threshold = 100
    const velocity = info.velocity.x

    if (info.offset.x > threshold || velocity > 500) {
      setSwiped(true)
      animate(x, 500, { duration: 0.3 })
      setTimeout(() => onSwipe('like'), 300)
    } else if (info.offset.x < -threshold || velocity < -500) {
      setSwiped(true)
      animate(x, -500, { duration: 0.3 })
      setTimeout(() => onSwipe('pass'), 300)
    } else {
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 })
    }
  }

  const handleButtonSwipe = (direction: 'like' | 'pass') => {
    if (swiped) return
    setSwiped(true)
    const target = direction === 'like' ? 500 : -500
    animate(x, target, { duration: 0.3 })
    setTimeout(() => onSwipe(direction), 300)
  }

  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* Counter */}
      <div className="text-center text-sm text-gray-400 mb-3">
        {index + 1} / {total}
      </div>

      {/* Card */}
      <motion.div
        ref={cardRef}
        style={{ x, rotate }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.8}
        onDragEnd={handleDragEnd}
        className="relative bg-white rounded-2xl shadow-xl overflow-hidden cursor-grab active:cursor-grabbing touch-none"
      >
        {/* Like/Pass indicators */}
        <motion.div
          style={{ opacity: likeOpacity }}
          className="absolute top-6 left-6 z-10 border-4 border-green-500 text-green-500 font-bold text-2xl px-4 py-1 rounded-lg -rotate-12"
        >
          LIKE
        </motion.div>
        <motion.div
          style={{ opacity: passOpacity }}
          className="absolute top-6 right-6 z-10 border-4 border-red-400 text-red-400 font-bold text-2xl px-4 py-1 rounded-lg rotate-12"
        >
          PASS
        </motion.div>

        {/* Property image */}
        <div className="relative aspect-[3/4]">
          <Image
            src={imageUrl}
            alt={title}
            fill
            className="object-contain bg-gray-50"
            sizes="(max-width: 448px) 100vw, 448px"
            priority
            draggable={false}
          />
        </div>

        {/* Title bar */}
        <div className="p-4 bg-white border-t">
          <h3 className="font-medium text-gray-900 truncate">{title}</h3>
        </div>
      </motion.div>

      {/* Action buttons */}
      <div className="flex justify-center gap-8 mt-6">
        <button
          onClick={() => handleButtonSwipe('pass')}
          disabled={swiped}
          className="w-16 h-16 rounded-full bg-white border-2 border-red-300 text-red-400 shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center disabled:opacity-50"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <button
          onClick={() => handleButtonSwipe('like')}
          disabled={swiped}
          className="w-16 h-16 rounded-full bg-white border-2 border-green-400 text-green-500 shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center disabled:opacity-50"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
