'use client'

import { useState, useRef } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import Image from 'next/image'

interface SwipeCardProps {
  imageUrl: string
  title: string
  index: number
  total: number
  canGoPrev: boolean
  canGoNext: boolean
  onNavigate: (direction: 'prev' | 'next') => void
}

export function SwipeCard({
  imageUrl,
  title,
  index,
  total,
  canGoPrev,
  canGoNext,
  onNavigate,
}: SwipeCardProps) {
  const [moving, setMoving] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-300, 0, 300], [-6, 0, 6])
  const nextOpacity = useTransform(x, [-120, 0], [1, 0])
  const prevOpacity = useTransform(x, [0, 120], [0, 1])

  const handleDragEnd = (
    _: unknown,
    info: { offset: { x: number }; velocity: { x: number } }
  ) => {
    const threshold = 90
    const velocity = info.velocity.x

    if ((info.offset.x < -threshold || velocity < -500) && canGoNext) {
      setMoving(true)
      animate(x, -500, { duration: 0.25 })
      setTimeout(() => {
        onNavigate('next')
        x.set(0)
        setMoving(false)
      }, 250)
    } else if ((info.offset.x > threshold || velocity > 500) && canGoPrev) {
      setMoving(true)
      animate(x, 500, { duration: 0.25 })
      setTimeout(() => {
        onNavigate('prev')
        x.set(0)
        setMoving(false)
      }, 250)
    } else {
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 })
    }
  }

  const handleButton = (direction: 'prev' | 'next') => {
    if (moving) return
    if (direction === 'next' && !canGoNext) return
    if (direction === 'prev' && !canGoPrev) return
    setMoving(true)
    const target = direction === 'next' ? -500 : 500
    animate(x, target, { duration: 0.25 })
    setTimeout(() => {
      onNavigate(direction)
      x.set(0)
      setMoving(false)
    }, 250)
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
        {/* Prev / Next direction hints */}
        <motion.div
          style={{ opacity: nextOpacity }}
          className="absolute top-6 right-6 z-10 border-2 border-gray-800 text-gray-800 font-bold text-sm px-3 py-1 rounded-lg"
        >
          次の物件 →
        </motion.div>
        <motion.div
          style={{ opacity: prevOpacity }}
          className="absolute top-6 left-6 z-10 border-2 border-gray-800 text-gray-800 font-bold text-sm px-3 py-1 rounded-lg"
        >
          ← 前の物件
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

      {/* Navigation buttons */}
      <div className="flex justify-center gap-8 mt-6">
        <button
          onClick={() => handleButton('prev')}
          disabled={moving || !canGoPrev}
          aria-label="前の物件"
          className="w-14 h-14 rounded-full bg-white border-2 border-gray-300 text-gray-700 shadow-md hover:shadow-lg hover:scale-105 transition-all flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg
            className="w-7 h-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => handleButton('next')}
          disabled={moving || !canGoNext}
          aria-label="次の物件"
          className="w-14 h-14 rounded-full bg-gray-900 text-white shadow-md hover:shadow-lg hover:scale-105 transition-all flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg
            className="w-7 h-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
