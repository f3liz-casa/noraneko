# SPDX-License-Identifier: MPL-2.0

require "fileutils"
require "open3"
require_relative "defines"

module FelesBuild
  module Utils
    # 走らせて、出たものを返す。失敗しても投げない。
    def self.run_checked(command, *args, cwd: nil)
      out, err, status = Open3.capture3(command, *args, chdir: cwd || Dir.pwd)
      { stdout: out, stderr: err, success: status.success?, code: status.exitstatus }
    end

    # 失敗したら投げる。
    def self.run(command, *args, cwd: nil)
      result = run_checked(command, *args, cwd: cwd)
      return result if result[:success]

      raise "Command failed: #{command} #{args.join(' ')}\n#{result[:stderr]}"
    end

    # 走らせて、行が出るたびに呼ぶ(stdout と stderr は分けたまま)。
    def self.run_with_logging(command)
      Open3.popen3(*command) do |stdin, stdout, stderr, wait|
        stdin.close
        [[stdout, :stdout], [stderr, :stderr]]
          .map { |io, name| Thread.new { io.each_line { |line| yield name, line } } }
          .each(&:join)
        wait.value.exitstatus
      end
    end

    # 近道を一つ張る。張れたら true。
    #
    # Windows の symlink は Developer Mode か管理者でないと張れない(Errno::EACCES)。
    # junction(mklink /J)なら権限が要らず、張り先はどれもディレクトリなので足りる。
    def self.create_symlink(link, target)
      return create_junction(link, target) if Defines::PLATFORM == :windows

      FileUtils.rm_rf(link) # symlink は辿らずに、その symlink だけが外れる
      FileUtils.ln_sf(target, link)
      true
    rescue => e
      warn "Failed to create symlink #{link} -> #{target}: #{e.message}"
      false
    end

    # junction を外すのは rmdir(/s を付けない。付けると張り先の中身まで消える)。
    # 前が無ければ rmdir は転ぶけれど、それでいい ── 消すものが無いだけ。
    def self.create_junction(link, target)
      win_link = link.tr("/", "\\")
      run_checked("cmd", "/c", "rmdir", win_link)
      FileUtils.rm_f(link) # junction でなく、ただのファイルだったとき

      result = run_checked("cmd", "/c", "mklink", "/J", win_link, target.tr("/", "\\"))
      return true if result[:success]

      warn "Failed to create junction #{link} -> #{target}: " \
           "#{result[:stdout].strip} #{result[:stderr].strip}"
      false
    end

    # FEATURE_MOUNTS の [張る名前, project からの相対] を base_dir の下に張る。
    def self.create_feature_symlinks(base_dir)
      Defines::FEATURE_MOUNTS.each do |name, target|
        create_symlink(File.join(base_dir, name), File.expand_path(target, Defines::PROJECT_ROOT))
      end
    end

    # tools/src/utils.ts の Logger と同じ形で出す: "[prefix] LEVEL: message"
    class Logger
      COLORS = {
        "INFO" => 34, "WARN" => 33, "ERROR" => 31, "SUCCESS" => 32, "DEBUG" => 90
      }.freeze

      def initialize(prefix)
        @prefix = prefix
      end

      def info(message) = say("INFO", message)
      def warn(message) = say("WARN", message)
      def error(message) = say("ERROR", message)
      def success(message) = say("SUCCESS", message)

      def debug(message)
        say("DEBUG", message) if ENV["DEBUG"]
      end

      private

      def say(level, message)
        puts "\e[#{COLORS.fetch(level)}m[#{@prefix}] #{level}: #{message}\e[0m"
      end
    end
  end
end
