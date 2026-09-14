# SPDX-License-Identifier: MPL-2.0

require_relative "defines"
require_relative "utils"

module FelesBuild
  # 手元の dev で起きている noraneko を閉じる。
  #
  # ここは人の使っているブラウザを落としかねない場所なので、「閉じてよいもの」を
  # 狭いほうから決める。二つの錠を**両方**通ったものだけを閉じる:
  #
  #   1. 実行ファイルが、この repo の _dist/bin/ の中にある
  #   2. --profile が、この repo の _dist/profile/test を指している
  #
  # どちらも、この repo の PROJECT_ROOT から組み立てた絶対 path との前方一致で見る。
  # 配って入れてもらった Noraneko(/Applications/… や ~/… から起きて、自分の profile を
  # 使っているもの)は、repo の外に居るのでどちらの錠も通らない。
  # 錠は and で、片方だけでは開かない。試験は tools/test/dev_browser_test.rb。
  module DevBrowser
    LOGGER = Utils::Logger.new("dev-browser")

    EXE_PREFIX = File.join(Defines::PATHS[:bin_root], "")       # .../_dist/bin/
    PROFILE = Defines::PATHS[:profile_test]                     # .../_dist/profile/test

    # 閉じてよいものか。command 一行だけを見る、副作用の無い判定(試験はここを突く)。
    def self.ours?(command, exe_prefix: EXE_PREFIX, profile: PROFILE)
      return false if command.nil? || command.empty?
      return false unless command.start_with?(exe_prefix)

      # `--profile <path>` の <path> がちょうどその profile であること
      command.match?(/(?<=\s)--profile\s+#{Regexp.escape(profile)}(?=\s|\z)/)
    end

    # [pid, command] の一覧。親だけ(子の plugin-container は親を閉じれば一緒に畳まれる)。
    def self.running
      Utils.ask("ps", "-axo", "pid=,command=").to_s.lines.filter_map do |line|
        pid, _, command = line.strip.partition(" ")
        next unless ours?(command)
        # 子プロセス(-parentPid を持つもの)は数えない
        next if command.include?("-parentPid")

        [pid.to_i, command]
      end
    end

    def self.stop
      found = running
      if found.empty?
        LOGGER.info "開発用の noraneko は動いていない。"
        return
      end

      found.each do |pid, command|
        LOGGER.info "閉じる: pid #{pid}"
        LOGGER.info "        #{command[0, 120]}"
        Process.kill("TERM", pid) rescue nil
      end

      # 畳むのを少し待つ。閉じきらないものだけ、あらためて落とす。
      20.times do
        break if running.empty?

        sleep 0.25
      end
      left = running
      left.each do |pid, _|
        LOGGER.warn "TERM で閉じなかったので KILL する: pid #{pid}"
        Process.kill("KILL", pid) rescue nil
      end

      LOGGER.success "#{found.length} 個 閉じた。"
    end
  end
end
