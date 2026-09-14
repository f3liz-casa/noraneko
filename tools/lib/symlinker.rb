# SPDX-License-Identifier: MPL-2.0

require_relative "defines"
require_relative "utils"

module FelesBuild
  # loader の隣に、i18n と modules への近道を張る(build.rb symlink)
  module Symlinker
    LOGGER = Utils::Logger.new("symlinker")

    LINKS = {
      File.join(Defines::PATHS[:loader_modules], "link-modules") => Defines::PATHS[:modules],
    }.freeze

    # 張れなかったら、そこで止める。このまま進むと tsdown が
    # 「cannot find entry link-modules/**/*.mts」と言って転ぶ ── 近道が無いのが
    # 本当の理由なのに、そうは読めない。
    def self.run
      failed = LINKS.reject { |link, target| Utils.create_symlink(link, target) }
      unless failed.empty?
        raise "近道を張れなかった: #{failed.keys.join(', ')}\n" \
              "  この先で tsdown が entry を見つけられずに転ぶので、ここで止める。"
      end
      LOGGER.success "Symlinks created successfully."
    end
  end
end
